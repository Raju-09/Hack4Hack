import mongoose from "mongoose";
import {
  Team, Membership, AuditLog, OutboxEvent, Hackathon,
  ITeam,
} from "../models/index.js";
import { withTransaction } from "../config/database.js";
import {
  AlreadyMemberError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  HackathonClosedError,
} from "../utils/errors.js";
import { logger } from "../utils/logger.js";

// ─── Public DTOs ──────────────────────────────────────────────────────────────

export interface TeamDTO {
  _id: string;
  hackathonId: string;
  name: string;
  description: string;
  leaderId: string;
  memberCount: number;
  maxMembers: number;
  availableSlots: number;
  skillsNeeded: string[];
  lookingForMembers: boolean;
  createdAt: Date;
}

export function toTeamDTO(team: ITeam): TeamDTO {
  return {
    _id:              String(team._id),
    hackathonId:      String(team.hackathonId),
    name:             team.name,
    description:      team.description,
    leaderId:         String(team.leaderId),
    memberCount:      team.memberCount,
    maxMembers:       team.maxMembers,
    availableSlots:   team.maxMembers - team.memberCount,
    skillsNeeded:     team.skillsNeeded,
    lookingForMembers: team.lookingForMembers,
    createdAt:        team.createdAt,
  };
}

// ─── Team Creation ────────────────────────────────────────────────────────────

/**
 * US-01: Create a team.
 * Team document and creator membership are created in one atomic transaction.
 * INV: creator becomes leader; memberCount = 1; audit written in same tx.
 */
export async function createTeam(input: {
  hackathonId: string;
  name: string;
  description: string;
  maxMembers: number;
  skillsNeeded: string[];
  lookingForMembers: boolean;
  creatorId: string;
}): Promise<TeamDTO> {
  const hackathon = await Hackathon.findById(input.hackathonId).lean();
  if (!hackathon) throw new NotFoundError("Hackathon");
  if (hackathon.status !== "open") throw new HackathonClosedError();

  if (input.maxMembers > hackathon.maxTeamSize) {
    throw new ConflictError(
      "EXCEEDS_MAX_TEAM_SIZE",
      `Team size cannot exceed hackathon limit of ${hackathon.maxTeamSize}`
    );
  }

  // Check existing membership before entering transaction
  const existingMembership = await Membership.findOne({
    hackathonId: input.hackathonId,
    userId: input.creatorId,
  }).lean();
  if (existingMembership) throw new AlreadyMemberError();

  const creatorObjId = new mongoose.Types.ObjectId(input.creatorId);
  const hackathonObjId = new mongoose.Types.ObjectId(input.hackathonId);

  return withTransaction(async (session) => {
    // Create team document
    const [team] = await Team.create(
      [
        {
          hackathonId:        hackathonObjId,
          name:               input.name,
          description:        input.description,
          leaderId:           creatorObjId,
          memberCount:        1,
          maxMembers:         input.maxMembers,
          skillsNeeded:       input.skillsNeeded,
          lookingForMembers:  input.lookingForMembers,
          version:            1,
        },
      ],
      { session }
    );

    if (!team) throw new Error("Team creation failed unexpectedly");

    // Create leader membership
    await Membership.create(
      [
        {
          hackathonId: hackathonObjId,
          teamId:      team._id,
          userId:      creatorObjId,
          role:        "leader",
          joinedAt:    new Date(),
        },
      ],
      { session }
    );

    // Audit log
    await AuditLog.create(
      [
        {
          hackathonId: hackathonObjId,
          teamId:      team._id,
          actorId:     creatorObjId,
          action:      "team.created",
          targetId:    null,
          metadata:    { teamName: team.name, maxMembers: team.maxMembers },
        },
      ],
      { session }
    );

    // Outbox event (published after commit)
    await OutboxEvent.create(
      [
        {
          eventType:   "team.created",
          aggregateId: String(team._id),
          hackathonId: hackathonObjId,
          payload: {
            teamId:      String(team._id),
            hackathonId: input.hackathonId,
            name:        team.name,
          },
          publishedAt: null,
        },
      ],
      { session }
    );

    logger.info("Team created", { teamId: team._id, creatorId: input.creatorId });
    return toTeamDTO(team);
  });
}

// ─── Team Discovery ───────────────────────────────────────────────────────────

export async function listTeams(input: {
  hackathonId?: string;
  skills?: string[];
  looking?: boolean;
  timezone?: string;
  limit: number;
  cursor?: string;
}): Promise<{ teams: TeamDTO[]; nextCursor: string | null }> {
  const filter: Record<string, unknown> = { deletedAt: null };

  if (input.hackathonId) filter["hackathonId"] = new mongoose.Types.ObjectId(input.hackathonId);
  if (input.looking !== undefined) filter["lookingForMembers"] = input.looking;
  if (input.skills && input.skills.length > 0) {
    filter["skillsNeeded"] = { $in: input.skills };
  }
  if (input.cursor) {
    try {
      const cursorId = Buffer.from(input.cursor, "base64").toString("utf8");
      filter["_id"] = { $lt: new mongoose.Types.ObjectId(cursorId) };
    } catch {
      // Invalid cursor — ignore
    }
  }

  const teams = await Team.find(filter)
    .sort({ _id: -1 })
    .limit(input.limit + 1)
    .lean();

  const hasMore = teams.length > input.limit;
  const result  = hasMore ? teams.slice(0, input.limit) : teams;
  const nextCursor = hasMore
    ? Buffer.from(String(result[result.length - 1]?._id)).toString("base64")
    : null;

  return {
    teams: result.map((t) => toTeamDTO(t as unknown as ITeam)),
    nextCursor,
  };
}

export async function getTeam(teamId: string): Promise<TeamDTO> {
  const team = await Team.findOne({ _id: teamId, deletedAt: null }).lean();
  if (!team) throw new NotFoundError("Team");
  return toTeamDTO(team as unknown as ITeam);
}

// ─── Team Update ──────────────────────────────────────────────────────────────

export async function updateTeam(input: {
  teamId: string;
  actorId: string;
  name?: string;
  description?: string;
  skillsNeeded?: string[];
  lookingForMembers?: boolean;
}): Promise<TeamDTO> {
  const team = await Team.findOne({ _id: input.teamId, deletedAt: null }).lean();
  if (!team) throw new NotFoundError("Team");
  if (String(team.leaderId) !== input.actorId) throw new ForbiddenError();

  const updates: Partial<ITeam> = {};
  if (input.name !== undefined)              updates.name = input.name;
  if (input.description !== undefined)       updates.description = input.description;
  if (input.skillsNeeded !== undefined)      updates.skillsNeeded = input.skillsNeeded;
  if (input.lookingForMembers !== undefined) updates.lookingForMembers = input.lookingForMembers;

  const updated = await Team.findOneAndUpdate(
    { _id: input.teamId, deletedAt: null },
    { $set: updates, $inc: { version: 1 } },
    { new: true }
  ).lean();

  if (!updated) throw new NotFoundError("Team");

  await AuditLog.create({
    hackathonId: updated.hackathonId,
    teamId:      updated._id,
    actorId:     new mongoose.Types.ObjectId(input.actorId),
    action:      "team.updated",
    targetId:    null,
    metadata:    { changes: Object.keys(updates) },
  });

  return toTeamDTO(updated as unknown as ITeam);
}

// ─── Team Members List ────────────────────────────────────────────────────────

export async function getTeamMembers(teamId: string) {
  const memberships = await Membership.find({ teamId })
    .populate("userId", "displayName skills timezone experienceLevel availability bio")
    .sort({ joinedAt: 1 })
    .lean();

  return memberships.map((m) => {
    const userObj = m.userId as unknown as Record<string, unknown> | null;
    return {
      userId:   String(m.userId),
      role:     m.role,
      joinedAt: m.joinedAt,
      ...(userObj && typeof userObj === "object"
        ? {
            displayName:     userObj["displayName"] as string,
            skills:          userObj["skills"] as string[],
            timezone:        userObj["timezone"] as string,
            experienceLevel: userObj["experienceLevel"] as string,
            availability:    userObj["availability"] as number,
            bio:             userObj["bio"] as string,
          }
        : {}),
    };
  });
}
