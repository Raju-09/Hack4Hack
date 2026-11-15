import mongoose from "mongoose";
import {
  Team, Membership, JoinRequest, AuditLog, OutboxEvent, Hackathon,
} from "../models/index.js";
import { withTransaction } from "../config/database.js";
import {
  TeamFullError,
  AlreadyMemberError,
  RequestExistsError,
  NotFoundError,
  ForbiddenError,
  RequestNotPendingError,
  HackathonClosedError,
} from "../utils/errors.js";
import { logger } from "../utils/logger.js";

// ─── Create Join Request ─────────────────────────────────────────────────────

/**
 * US-03: Submit a join request.
 *
 * Idempotent at the application layer: the unique index on (teamId, userId)
 * ensures at most one pending request per (user, team). Double-taps are
 * handled by the idempotency middleware before this service is reached.
 *
 * We do NOT check capacity here — capacity is re-checked at acceptance (US-04).
 * A team may have space when the request is sent and be full when accepted.
 */
export async function createJoinRequest(input: {
  teamId: string;
  userId: string;
  message: string;
}): Promise<{ requestId: string }> {
  return withTransaction(async (session) => {
    const team = await Team.findOne({
      _id: input.teamId,
      deletedAt: null,
    }).session(session);
    if (!team) throw new NotFoundError("Team");

    const hackathon = await Hackathon.findById(team.hackathonId).session(session).lean();
    if (!hackathon || hackathon.status !== "open") throw new HackathonClosedError();

    if (!team.lookingForMembers) {
      throw new ForbiddenError("This team is not accepting join requests");
    }

    // Check existing membership in this hackathon
    const membership = await Membership.findOne({
      hackathonId: team.hackathonId,
      userId: input.userId,
    }).session(session).lean();
    if (membership) throw new AlreadyMemberError();

    const userObjId = new mongoose.Types.ObjectId(input.userId);
    const teamObjId = new mongoose.Types.ObjectId(input.teamId);

    // Check if a request already exists for this (teamId, userId)
    const existingRequest = await JoinRequest.findOne({ teamId: teamObjId, userId: userObjId }).session(session);
    let requestId: string;

    if (existingRequest) {
      if (existingRequest.status === "pending") {
        throw new RequestExistsError();
      }
      if (existingRequest.status === "accepted") {
        throw new AlreadyMemberError();
      }
      // Reapplication after "declined", "conflict", or "cancelled"
      existingRequest.status = "pending";
      existingRequest.message = input.message;
      existingRequest.updatedAt = new Date();
      await existingRequest.save({ session });
      requestId = String(existingRequest._id);
    } else {
      try {
        const created = await JoinRequest.create(
          [
            {
              hackathonId: team.hackathonId,
              teamId:      teamObjId,
              userId:      userObjId,
              message:     input.message,
              status:      "pending",
            },
          ],
          { session, ordered: true }
        );
        const firstCreated = created[0];
        if (!firstCreated) throw new Error("Failed to create join request");
        requestId = String(firstCreated._id);
      } catch (err) {
        if (
          (err as any)?.code === 11000 ||
          (err instanceof mongoose.mongo.MongoServerError && err.code === 11000)
        ) {
          throw new RequestExistsError();
        }
        throw err;
      }
    }

    // Outbox: notify team leader within same transaction
    await OutboxEvent.create(
      [
        {
          eventType:   "join_request.created",
          aggregateId: String(team._id),
          hackathonId: team.hackathonId,
          payload: {
            requestId,
            teamId:    input.teamId,
            userId:    input.userId,
          },
          publishedAt: null,
        },
      ],
      { session }
    );

    logger.info("Join request created", { requestId, teamId: input.teamId, userId: input.userId });
    return { requestId };
  });
}

// ─── Accept Join Request ──────────────────────────────────────────────────────

/**
 * US-04: Leader accepts a join request.
 *
 * CRITICAL CORRECTNESS SECTION.
 *
 * Everything inside the transaction is atomic. The sequence:
 * 1. Verify actor is current leader (inside transaction, not before).
 * 2. Verify request is still pending.
 * 3. Conditionally increment memberCount only if memberCount < maxMembers.
 *    This is the capacity reservation — the atomic findOneAndUpdate with $expr.
 * 4. Insert membership — unique index fires if user already in another team.
 * 5. Update request status to "accepted".
 * 6. Write audit log.
 * 7. Write outbox event.
 * 8. Commit.
 *
 * If steps 4–7 fail, the transaction aborts and step 3 is reversed.
 * memberCount never becomes inconsistent.
 *
 * Under 50 concurrent accepts for one seat, MongoDB serialises the conflicting
 * team document updates. Exactly one request reserves the seat (step 3 succeeds).
 * The other 49 see memberCount = maxMembers and throw TeamFullError.
 */
export async function acceptJoinRequest(input: {
  requestId: string;
  actorId: string;
}): Promise<{ teamId: string; userId: string }> {
  try {
    return await withTransaction(async (session) => {
      // Load request (must be pending)
      const request = await JoinRequest.findById(input.requestId).session(session);
      if (!request) throw new NotFoundError("Join request");
      if (request.status !== "pending") throw new RequestNotPendingError();

      const teamId     = request.teamId;
      const targetUser = request.userId;

      // ── Step 1: Verify actor is CURRENT leader (inside transaction) ─────────
      const teamBeforeUpdate = await Team.findOne({
        _id: teamId,
        deletedAt: null,
      }).session(session);
      if (!teamBeforeUpdate) throw new NotFoundError("Team");
      if (String(teamBeforeUpdate.leaderId) !== input.actorId) {
        throw new ForbiddenError("Only the team leader can accept join requests");
      }

      // ── Step 2: Hackathon still open ────────────────────────────────────────
      const hackathon = await Hackathon.findById(teamBeforeUpdate.hackathonId).session(session).lean();
      if (!hackathon || hackathon.status !== "open") throw new HackathonClosedError();

      // ── Step 3: Atomic capacity reservation ─────────────────────────────────
      // findOneAndUpdate only succeeds if memberCount < maxMembers.
      // This is the single point where the "last seat" race is decided.
      const updatedTeam = await Team.findOneAndUpdate(
        {
          _id:              teamId,
          deletedAt:        null,
          lookingForMembers: true,
          $expr: { $lt: ["$memberCount", "$maxMembers"] },
        },
        { $inc: { memberCount: 1, version: 1 } },
        { session, new: true }
      );

      if (!updatedTeam) {
        throw new TeamFullError();
      }

      // ── Step 4: Insert membership ────────────────────────────────────────────
      // The unique index on (hackathonId, userId) fires here if the user
      // has already joined another team, reverting the capacity increment.
      try {
        await Membership.create(
          [
            {
              hackathonId: teamBeforeUpdate.hackathonId,
              teamId,
              userId:      targetUser,
              role:        "member",
              joinedAt:    new Date(),
            },
          ],
          { session, ordered: true }
        );
      } catch (err: any) {
        // User already in another team — throw to abort transaction
        if (
          err?.code === 11000 ||
          (err instanceof mongoose.mongo.MongoServerError && err.code === 11000)
        ) {
          throw new AlreadyMemberError();
        }
        throw err;
      }

      // ── Step 5: Transition request to accepted ───────────────────────────────
      await JoinRequest.updateOne(
        { _id: request._id, status: "pending" },  // extra guard
        { $set: { status: "accepted", updatedAt: new Date() } },
        { session }
      );

      const actorObjId = new mongoose.Types.ObjectId(input.actorId);

      // ── Step 6: Audit ────────────────────────────────────────────────────────
      await AuditLog.create(
        [
          {
            hackathonId: teamBeforeUpdate.hackathonId,
            teamId,
            actorId:    actorObjId,
            action:     "join_request.accepted",
            targetId:   targetUser,
            metadata:   { requestId: input.requestId, memberCount: updatedTeam.memberCount },
          },
        ],
        { session }
      );

      // ── Step 7: Outbox ───────────────────────────────────────────────────────
      await OutboxEvent.create(
        [
          {
            eventType:   "join_request.accepted",
            aggregateId: String(teamId),
            hackathonId: teamBeforeUpdate.hackathonId,
            payload: {
              teamId:    String(teamId),
              userId:    String(targetUser),
              requestId: input.requestId,
            },
            publishedAt: null,
          },
        ],
        { session }
      );

      logger.info("Join request accepted", {
        requestId: input.requestId,
        teamId: String(teamId),
        userId: String(targetUser),
        newMemberCount: updatedTeam.memberCount,
      });

      return { teamId: String(teamId), userId: String(targetUser) };
    });
  } catch (err) {
    if (err instanceof TeamFullError || err instanceof AlreadyMemberError) {
      // Mark request as conflict outside the aborted transaction so user knows why
      try {
        const conflictDoc = await JoinRequest.findOneAndUpdate(
          { _id: input.requestId, status: "pending" },
          { $set: { status: "conflict", updatedAt: new Date() } },
          { new: true }
        ).lean();

        if (conflictDoc) {
          const reason = err instanceof TeamFullError ? "team_full" : "already_member";
          await AuditLog.create({
            hackathonId: conflictDoc.hackathonId,
            teamId:      conflictDoc.teamId,
            actorId:     new mongoose.Types.ObjectId(input.actorId),
            action:      "join_request.conflict",
            targetId:    conflictDoc.userId,
            metadata:    { requestId: input.requestId, reason },
          }).catch(() => {});

          await OutboxEvent.create({
            eventType:   "join_request.conflict",
            aggregateId: String(conflictDoc.teamId),
            hackathonId: conflictDoc.hackathonId,
            payload: {
              teamId:    String(conflictDoc.teamId),
              userId:    String(conflictDoc.userId),
              requestId: input.requestId,
              reason,
            },
            publishedAt: null,
          }).catch(() => {});
        }
      } catch {
        // Best effort conflict recording outside aborted transaction
      }
    }
    throw err;
  }
}

// ─── Decline Join Request ─────────────────────────────────────────────────────

export async function declineJoinRequest(input: {
  requestId: string;
  actorId: string;
}): Promise<void> {
  const request = await JoinRequest.findById(input.requestId).lean();
  if (!request) throw new NotFoundError("Join request");

  // Authorization: must be leader of the team
  const team = await Team.findOne({ _id: request.teamId, deletedAt: null }).lean();
  if (!team) throw new NotFoundError("Team");
  if (String(team.leaderId) !== input.actorId) {
    throw new ForbiddenError("Only the team leader can decline join requests");
  }

  if (request.status !== "pending") {
    // Idempotent decline — already processed
    return;
  }

  await JoinRequest.updateOne(
    { _id: input.requestId, status: "pending" },
    { $set: { status: "declined", updatedAt: new Date() } }
  );

  await AuditLog.create({
    hackathonId: request.hackathonId,
    teamId:      request.teamId,
    actorId:     new mongoose.Types.ObjectId(input.actorId),
    action:      "join_request.declined",
    targetId:    request.userId,
    metadata:    { requestId: input.requestId },
  });

  await OutboxEvent.create({
    eventType:   "join_request.declined",
    aggregateId: String(request.teamId),
    hackathonId: request.hackathonId,
    payload: {
      requestId: input.requestId,
      teamId:    String(request.teamId),
      userId:    String(request.userId),
    },
    publishedAt: null,
  });
}

// ─── Leave Team ───────────────────────────────────────────────────────────────

/**
 * US-06: Member leaves a team.
 *
 * Leader departure logic:
 * 1. If only member → delete team atomically.
 * 2. If other members → promote earliest-joined member (deterministic).
 *    OR use successorId if explicitly provided and valid.
 *
 * All operations are in one transaction.
 */
export async function leaveTeam(input: {
  teamId: string;
  userId: string;
  successorId?: string;
}): Promise<{ teamDeleted: boolean; newLeaderId?: string }> {
  return withTransaction(async (session) => {
    const team = await Team.findOne({ _id: input.teamId, deletedAt: null }).session(session);
    if (!team) throw new NotFoundError("Team");

    const membership = await Membership.findOne({
      teamId: input.teamId,
      userId: input.userId,
    }).session(session);
    if (!membership) throw new NotFoundError("Membership");

    const isLeader = String(team.leaderId) === input.userId;
    const userObjId = new mongoose.Types.ObjectId(input.userId);

    // ── Case 1: Only member → delete team ────────────────────────────────────
    if (team.memberCount === 1) {
      await Team.updateOne(
        { _id: team._id },
        { $set: { deletedAt: new Date(), memberCount: 0 } },
        { session }
      );
      await Membership.deleteOne({ _id: membership._id }, { session });
      // Cancel all pending requests for this team
      await JoinRequest.updateMany(
        { teamId: team._id, status: "pending" },
        { $set: { status: "cancelled" } },
        { session }
      );

      await AuditLog.create(
        [
          {
            hackathonId: team.hackathonId,
            teamId:      team._id,
            actorId:     userObjId,
            action:      "team.deleted",
            targetId:    null,
            metadata:    { reason: "last_member_left" },
          },
        ],
        { session, ordered: true }
      );

      await OutboxEvent.create(
        [
          {
            eventType:   "team.deleted",
            aggregateId: String(team._id),
            hackathonId: team.hackathonId,
            payload:     { teamId: String(team._id) },
            publishedAt: null,
          },
        ],
        { session, ordered: true }
      );

      return { teamDeleted: true };
    }

    // ── Case 2: Other members remain ──────────────────────────────────────────
    if (isLeader) {
      // Determine successor
      let successorMembership;

      if (input.successorId) {
        // Explicit successor chosen by leader
        successorMembership = await Membership.findOne({
          teamId: input.teamId,
          userId: input.successorId,
        }).session(session).lean();
        if (!successorMembership) {
          throw new ForbiddenError("Specified successor is not a team member");
        }
      } else {
        // Auto-select: earliest joinedAt among remaining members
        successorMembership = await Membership.findOne({
          teamId: input.teamId,
          userId: { $ne: userObjId },
        })
          .sort({ joinedAt: 1 })
          .session(session)
          .lean();
      }

      if (!successorMembership) throw new Error("No successor found — data inconsistency");

      const newLeaderId = successorMembership.userId;

      // Update team: new leader, decrement memberCount
      await Team.updateOne(
        { _id: team._id },
        { $set: { leaderId: newLeaderId }, $inc: { memberCount: -1, version: 1 } },
        { session }
      );

      // Update membership roles
      await Membership.updateOne(
        { _id: successorMembership._id },
        { $set: { role: "leader" } },
        { session }
      );
      await Membership.deleteOne({ _id: membership._id }, { session });

      await AuditLog.create(
        [
          {
            hackathonId: team.hackathonId,
            teamId:      team._id,
            actorId:     userObjId,
            action:      "team.leader_changed",
            targetId:    newLeaderId,
            metadata:    { previousLeaderId: input.userId, reason: "leader_left" },
          },
          {
            hackathonId: team.hackathonId,
            teamId:      team._id,
            actorId:     userObjId,
            action:      "team.member_left",
            targetId:    userObjId,
            metadata:    {},
          },
        ],
        { session, ordered: true }
      );

      await OutboxEvent.create(
        [
          {
            eventType:   "team.leader_changed",
            aggregateId: String(team._id),
            hackathonId: team.hackathonId,
            payload: {
              teamId:          String(team._id),
              newLeaderId:     String(newLeaderId),
              previousLeaderId: input.userId,
            },
            publishedAt: null,
          },
        ],
        { session, ordered: true }
      );

      return { teamDeleted: false, newLeaderId: String(newLeaderId) };
    }

    // Regular member leaves
    await Team.updateOne(
      { _id: team._id },
      { $inc: { memberCount: -1, version: 1 } },
      { session }
    );
    await Membership.deleteOne({ _id: membership._id }, { session });

    await AuditLog.create(
      [
        {
          hackathonId: team.hackathonId,
          teamId:      team._id,
          actorId:     userObjId,
          action:      "team.member_left",
          targetId:    userObjId,
          metadata:    {},
        },
      ],
      { session }
    );

    await OutboxEvent.create(
      [
        {
          eventType:   "team.member_left",
          aggregateId: String(team._id),
          hackathonId: team.hackathonId,
          payload:     { teamId: String(team._id), userId: input.userId },
          publishedAt: null,
        },
      ],
      { session }
    );

    return { teamDeleted: false };
  });
}

// ─── Remove Member ────────────────────────────────────────────────────────────

/**
 * US-07: Leader removes a member.
 */
export async function removeMember(input: {
  teamId: string;
  actorId: string;
  targetUserId: string;
}): Promise<void> {
  return withTransaction(async (session) => {
    const team = await Team.findOne({ _id: input.teamId, deletedAt: null }).session(session);
    if (!team) throw new NotFoundError("Team");
    if (String(team.leaderId) !== input.actorId) {
      throw new ForbiddenError("Only the team leader can remove members");
    }
    if (input.actorId === input.targetUserId) {
      throw new ForbiddenError("Use leave-team to remove yourself");
    }

    const targetMembership = await Membership.findOne({
      teamId: input.teamId,
      userId: input.targetUserId,
    }).session(session);
    if (!targetMembership) throw new NotFoundError("Membership");

    await Membership.deleteOne({ _id: targetMembership._id }, { session });
    await Team.updateOne(
      { _id: team._id },
      { $inc: { memberCount: -1, version: 1 } },
      { session }
    );

    const actorObjId = new mongoose.Types.ObjectId(input.actorId);
    const targetObjId = new mongoose.Types.ObjectId(input.targetUserId);

    await AuditLog.create(
      [
        {
          hackathonId: team.hackathonId,
          teamId:      team._id,
          actorId:     actorObjId,
          action:      "team.member_removed",
          targetId:    targetObjId,
          metadata:    {},
        },
      ],
      { session }
    );

    await OutboxEvent.create(
      [
        {
          eventType:   "team.member_left",
          aggregateId: String(team._id),
          hackathonId: team.hackathonId,
          payload: {
            teamId: String(team._id),
            userId: input.targetUserId,
            removedBy: input.actorId,
          },
          publishedAt: null,
        },
      ],
      { session }
    );

    logger.info("Member removed", { teamId: input.teamId, targetUserId: input.targetUserId, actorId: input.actorId });
  });
}

// ─── Get join requests for a team ────────────────────────────────────────────

export async function getTeamJoinRequests(input: {
  teamId: string;
  actorId: string;
  status?: string;
}) {
  const team = await Team.findOne({ _id: input.teamId, deletedAt: null }).lean();
  if (!team) throw new NotFoundError("Team");
  if (String(team.leaderId) !== input.actorId) {
    throw new ForbiddenError("Only the team leader can view join requests");
  }

  const filter: Record<string, unknown> = { teamId: input.teamId };
  if (input.status) filter["status"] = input.status;

  const requests = await JoinRequest.find(filter)
    .populate("userId", "displayName skills timezone experienceLevel availability bio")
    .sort({ createdAt: 1 })
    .lean();

  return requests.map((r) => {
    const userObj = r.userId as unknown as Record<string, unknown> | null;
    return {
      _id:     String(r._id),
      status:  r.status,
      message: r.message,
      createdAt: r.createdAt,
      user: userObj && typeof userObj === "object"
        ? {
            _id:             String(userObj["_id"]),
            displayName:     userObj["displayName"] as string,
            skills:          userObj["skills"] as string[],
            timezone:        userObj["timezone"] as string,
            experienceLevel: userObj["experienceLevel"] as string,
            availability:    userObj["availability"] as number,
            bio:             userObj["bio"] as string,
          }
        : { _id: String(r.userId) },
    };
  });
}
