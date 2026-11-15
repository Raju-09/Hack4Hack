import mongoose from "mongoose";
import {
  InviteCode, Team, Membership, AuditLog, OutboxEvent, Hackathon,
} from "../models/index.js";
import { withTransaction } from "../config/database.js";
import { generateInviteToken, hashToken } from "../utils/crypto.js";
import {
  NotFoundError,
  ForbiddenError,
  InviteExpiredError,
  InviteRevokedError,
  InviteUsedUpError,
  TeamFullError,
  AlreadyMemberError,
  HackathonClosedError,
} from "../utils/errors.js";
import { logger } from "../utils/logger.js";

// ─── Create Invite ────────────────────────────────────────────────────────────

export async function createInvite(input: {
  teamId: string;
  actorId: string;
  expiresInHours: number;
  maxUses: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const team = await Team.findOne({ _id: input.teamId, deletedAt: null }).lean();
  if (!team) throw new NotFoundError("Team");
  if (String(team.leaderId) !== input.actorId) {
    throw new ForbiddenError("Only the team leader can create invitations");
  }

  const hackathon = await Hackathon.findById(team.hackathonId).lean();
  if (!hackathon || hackathon.status !== "open") throw new HackathonClosedError();

  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

  await InviteCode.create({
    teamId:      new mongoose.Types.ObjectId(input.teamId),
    hackathonId: team.hackathonId,
    codeHash:    tokenHash,
    expiresAt,
    maxUses:     input.maxUses,
    useCount:    0,
    createdBy:   new mongoose.Types.ObjectId(input.actorId),
  });

  await AuditLog.create({
    hackathonId: team.hackathonId,
    teamId:      team._id,
    actorId:     new mongoose.Types.ObjectId(input.actorId),
    action:      "invite.created",
    targetId:    null,
    metadata:    { expiresAt, maxUses: input.maxUses },
  });

  logger.info("Invite created", { teamId: input.teamId, actorId: input.actorId });

  // Return raw token ONCE — never stored
  return { token, expiresAt };
}

// ─── Redeem Invite ────────────────────────────────────────────────────────────

/**
 * US-02: Redeem an invite code.
 *
 * All validation and membership creation happen in one transaction.
 * Race conditions handled by:
 * - Atomic useCount increment with max-uses condition
 * - Atomic capacity reservation
 * - Unique membership index
 */
export async function redeemInvite(input: {
  token: string;
  userId: string;
}): Promise<{ teamId: string }> {
  const tokenHash = hashToken(input.token);

  return withTransaction(async (session) => {
    // Look up invite by hash
    const invite = await InviteCode.findOne({ codeHash: tokenHash }).session(session);
    if (!invite) throw new NotFoundError("Invitation");

    // ── Validate invite ──────────────────────────────────────────────────────
    // Always validate synchronously in handler — TTL index is not the security boundary
    if (invite.revokedAt) throw new InviteRevokedError();
    if (invite.expiresAt < new Date()) throw new InviteExpiredError();
    if (invite.useCount >= invite.maxUses) throw new InviteUsedUpError();

    const team = await Team.findOne({ _id: invite.teamId, deletedAt: null }).session(session);
    if (!team) throw new NotFoundError("Team");

    const hackathon = await Hackathon.findById(team.hackathonId).session(session).lean();
    if (!hackathon || hackathon.status !== "open") throw new HackathonClosedError();

    // ── Validate membership ──────────────────────────────────────────────────
    const existingMembership = await Membership.findOne({
      hackathonId: team.hackathonId,
      userId: input.userId,
    }).session(session).lean();
    if (existingMembership) throw new AlreadyMemberError();

    // ── Atomic capacity reservation ──────────────────────────────────────────
    const updatedTeam = await Team.findOneAndUpdate(
      {
        _id:      invite.teamId,
        deletedAt: null,
        $expr:    { $lt: ["$memberCount", "$maxMembers"] },
      },
      { $inc: { memberCount: 1, version: 1 } },
      { session, new: true }
    );
    if (!updatedTeam) throw new TeamFullError();

    // ── Increment invite use count ───────────────────────────────────────────
    await InviteCode.updateOne(
      { _id: invite._id, useCount: { $lt: invite.maxUses } },
      { $inc: { useCount: 1 } },
      { session }
    );

    // ── Create membership ────────────────────────────────────────────────────
    const userObjId = new mongoose.Types.ObjectId(input.userId);
    try {
      await Membership.create(
        [
          {
            hackathonId: team.hackathonId,
            teamId:      team._id,
            userId:      userObjId,
            role:        "member",
            joinedAt:    new Date(),
          },
        ],
        { session }
      );
    } catch (err) {
      if (
        err instanceof mongoose.mongo.MongoServerError &&
        err.code === 11000
      ) {
        throw new AlreadyMemberError();
      }
      throw err;
    }

    await AuditLog.create(
      [
        {
          hackathonId: team.hackathonId,
          teamId:      team._id,
          actorId:     userObjId,
          action:      "invite.redeemed",
          targetId:    null,
          metadata:    { inviteId: String(invite._id) },
        },
      ],
      { session }
    );

    await OutboxEvent.create(
      [
        {
          eventType:   "team.member_joined",
          aggregateId: String(team._id),
          hackathonId: team.hackathonId,
          payload:     { teamId: String(team._id), userId: input.userId },
          publishedAt: null,
        },
      ],
      { session }
    );

    logger.info("Invite redeemed", { teamId: String(team._id), userId: input.userId });
    return { teamId: String(team._id) };
  });
}

// ─── Revoke Invite ────────────────────────────────────────────────────────────

export async function revokeInvite(input: {
  inviteId: string;
  actorId: string;
}): Promise<void> {
  const invite = await InviteCode.findById(input.inviteId).lean();
  if (!invite) throw new NotFoundError("Invitation");

  const team = await Team.findOne({ _id: invite.teamId, deletedAt: null }).lean();
  if (!team) throw new NotFoundError("Team");
  if (String(team.leaderId) !== input.actorId) {
    throw new ForbiddenError("Only the team leader can revoke invitations");
  }

  await InviteCode.updateOne(
    { _id: input.inviteId },
    { $set: { revokedAt: new Date() } }
  );

  await AuditLog.create({
    hackathonId: team.hackathonId,
    teamId:      team._id,
    actorId:     new mongoose.Types.ObjectId(input.actorId),
    action:      "invite.revoked",
    targetId:    null,
    metadata:    { inviteId: input.inviteId },
  });
}

// ─── List Invites for a team ──────────────────────────────────────────────────

export async function listTeamInvites(input: {
  teamId: string;
  actorId: string;
}) {
  const team = await Team.findOne({ _id: input.teamId, deletedAt: null }).lean();
  if (!team) throw new NotFoundError("Team");
  if (String(team.leaderId) !== input.actorId) {
    throw new ForbiddenError("Only the team leader can view invitations");
  }

  const invites = await InviteCode.find({ teamId: input.teamId })
    .sort({ createdAt: -1 })
    .lean();

  return invites.map((inv) => ({
    _id:       String(inv._id),
    expiresAt: inv.expiresAt,
    revokedAt: inv.revokedAt,
    maxUses:   inv.maxUses,
    useCount:  inv.useCount,
    isValid:   !inv.revokedAt && inv.expiresAt > new Date() && inv.useCount < inv.maxUses,
    createdAt: inv.createdAt,
    // Raw token is NEVER returned after creation
  }));
}
