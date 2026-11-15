import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Users ───────────────────────────────────────────────────────────────────

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  displayName: string;
  email: string;
  passwordHash: string;
  skills: string[];
  timezone: string;         // IANA timezone string e.g. "Asia/Kolkata"
  experienceLevel: "beginner" | "intermediate" | "advanced";
  availability: number;     // hours per day
  bio: string;
  discoverable: boolean;
  refreshTokenHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;   // soft delete
}

const userSchema = new Schema<IUser>(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    email:       { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    skills:      { type: [String], default: [] },
    timezone:    { type: String, default: "UTC" },
    experienceLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "intermediate",
    },
    availability: { type: Number, min: 0, max: 24, default: 4 },
    bio:          { type: String, default: "", maxlength: 500 },
    discoverable: { type: Boolean, default: false },
    refreshTokenHash: { type: String, default: null, select: false },
    deletedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

// Unique email (not sparse — email is always required)
userSchema.index({ email: 1 }, { unique: true });
// Discovery board query
userSchema.index({ discoverable: 1, skills: 1 });

export const User: Model<IUser> = mongoose.models["User"] as Model<IUser>
  ?? mongoose.model<IUser>("User", userSchema);

// ─── Hackathons ───────────────────────────────────────────────────────────────

export interface IHackathon extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  minTeamSize: number;
  maxTeamSize: number;
  status: "draft" | "open" | "closed" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

const hackathonSchema = new Schema<IHackathon>(
  {
    name:        { type: String, required: true, trim: true },
    slug:        { type: String, required: true, lowercase: true, trim: true },
    minTeamSize: { type: Number, required: true, min: 1 },
    maxTeamSize: { type: Number, required: true, min: 1 },
    status:      { type: String, enum: ["draft", "open", "closed", "archived"], default: "open" },
  },
  { timestamps: true }
);

hackathonSchema.index({ slug: 1 }, { unique: true });
hackathonSchema.index({ status: 1 });

export const Hackathon: Model<IHackathon> = mongoose.models["Hackathon"] as Model<IHackathon>
  ?? mongoose.model<IHackathon>("Hackathon", hackathonSchema);

// ─── Teams ────────────────────────────────────────────────────────────────────

export interface ITeam extends Document {
  _id: mongoose.Types.ObjectId;
  hackathonId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  leaderId: mongoose.Types.ObjectId;
  memberCount: number;      // INV-2: must equal count(memberships) at all times
  maxMembers: number;
  skillsNeeded: string[];
  lookingForMembers: boolean;
  version: number;          // optimistic locking aid
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<ITeam>(
  {
    hackathonId:        { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    name:               { type: String, required: true, trim: true, maxlength: 80 },
    description:        { type: String, default: "", maxlength: 500 },
    leaderId:           { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberCount:        { type: Number, default: 0, min: 0 },
    maxMembers:         { type: Number, required: true, min: 1, max: 10 },
    skillsNeeded:       { type: [String], default: [] },
    lookingForMembers:  { type: Boolean, default: true },
    version:            { type: Number, default: 1 },
    deletedAt:          { type: Date, default: null },
  },
  { timestamps: true }
);

// Unique team name within a hackathon (excluding soft-deleted teams)
teamSchema.index(
  { hackathonId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
// Discovery board query — most critical read path
teamSchema.index({ hackathonId: 1, lookingForMembers: 1, createdAt: -1, deletedAt: 1 });
// Leader lookup
teamSchema.index({ leaderId: 1 });

export const Team: Model<ITeam> = mongoose.models["Team"] as Model<ITeam>
  ?? mongoose.model<ITeam>("Team", teamSchema);

// ─── Memberships ─────────────────────────────────────────────────────────────

export type MemberRole = "leader" | "member";

export interface IMembership extends Document {
  _id: mongoose.Types.ObjectId;
  hackathonId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: MemberRole;
  joinedAt: Date;
}

const membershipSchema = new Schema<IMembership>(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    teamId:      { type: Schema.Types.ObjectId, ref: "Team", required: true },
    userId:      { type: Schema.Types.ObjectId, ref: "User", required: true },
    role:        { type: String, enum: ["leader", "member"], default: "member" },
    joinedAt:    { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

/**
 * INV-4: One membership per user per hackathon.
 * This unique index is the last line of defense against duplicate memberships,
 * even if application logic has a bug.
 */
membershipSchema.index({ hackathonId: 1, userId: 1 }, { unique: true });
// Team membership list
membershipSchema.index({ teamId: 1, joinedAt: 1 });

export const Membership: Model<IMembership> = mongoose.models["Membership"] as Model<IMembership>
  ?? mongoose.model<IMembership>("Membership", membershipSchema);

// ─── JoinRequests ─────────────────────────────────────────────────────────────

export type JoinRequestStatus = "pending" | "accepted" | "declined" | "conflict" | "cancelled";

export interface IJoinRequest extends Document {
  _id: mongoose.Types.ObjectId;
  hackathonId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  message: string;
  status: JoinRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const joinRequestSchema = new Schema<IJoinRequest>(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    teamId:      { type: Schema.Types.ObjectId, ref: "Team", required: true },
    userId:      { type: Schema.Types.ObjectId, ref: "User", required: true },
    message:     { type: String, default: "", maxlength: 300 },
    status:      {
      type: String,
      enum: ["pending", "accepted", "declined", "conflict", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

/**
 * INV-5: One request per (user, team).
 * Prevents double-tapping from creating duplicate requests.
 */
joinRequestSchema.index({ teamId: 1, userId: 1 }, { unique: true });
// Leader inbox query
joinRequestSchema.index({ teamId: 1, status: 1, createdAt: 1 });
// User's outgoing requests
joinRequestSchema.index({ userId: 1, hackathonId: 1 });

export const JoinRequest: Model<IJoinRequest> = mongoose.models["JoinRequest"] as Model<IJoinRequest>
  ?? mongoose.model<IJoinRequest>("JoinRequest", joinRequestSchema);

// ─── InviteCodes ──────────────────────────────────────────────────────────────

export interface IInviteCode extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  hackathonId: mongoose.Types.ObjectId;
  codeHash: string;         // SHA-256 of raw token; raw token is never stored
  expiresAt: Date;
  revokedAt: Date | null;
  maxUses: number;
  useCount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const inviteCodeSchema = new Schema<IInviteCode>(
  {
    teamId:      { type: Schema.Types.ObjectId, ref: "Team", required: true },
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    codeHash:    { type: String, required: true },
    expiresAt:   { type: Date, required: true },
    revokedAt:   { type: Date, default: null },
    maxUses:     { type: Number, default: 1, min: 1, max: 100 },
    useCount:    { type: Number, default: 0 },
    createdBy:   { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

inviteCodeSchema.index({ codeHash: 1 }, { unique: true });
inviteCodeSchema.index({ teamId: 1, createdAt: -1 });
// TTL cleanup of expired codes (asynchronous — validation is still done in handler)
inviteCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const InviteCode: Model<IInviteCode> = mongoose.models["InviteCode"] as Model<IInviteCode>
  ?? mongoose.model<IInviteCode>("InviteCode", inviteCodeSchema);

// ─── AuditLogs ────────────────────────────────────────────────────────────────

export type AuditAction =
  | "team.created"
  | "team.updated"
  | "team.deleted"
  | "team.member_joined"
  | "team.member_left"
  | "team.member_removed"
  | "team.leader_changed"
  | "join_request.created"
  | "join_request.accepted"
  | "join_request.declined"
  | "join_request.cancelled"
  | "invite.created"
  | "invite.redeemed"
  | "invite.revoked";

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  hackathonId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  action: AuditAction;
  targetId: mongoose.Types.ObjectId | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    teamId:      { type: Schema.Types.ObjectId, ref: "Team", required: true },
    actorId:     { type: Schema.Types.ObjectId, ref: "User", required: true },
    action:      { type: String, required: true },
    targetId:    { type: Schema.Types.ObjectId, default: null },
    metadata:    { type: Schema.Types.Mixed, default: {} },
    createdAt:   { type: Date, default: () => new Date(), immutable: true },
  },
  { timestamps: false }
);

auditLogSchema.index({ teamId: 1, createdAt: -1 });
auditLogSchema.index({ hackathonId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export const AuditLog: Model<IAuditLog> = mongoose.models["AuditLog"] as Model<IAuditLog>
  ?? mongoose.model<IAuditLog>("AuditLog", auditLogSchema);

// ─── IdempotencyRecords ───────────────────────────────────────────────────────

export type IdempotencyStatus = "processing" | "completed" | "failed";

export interface IIdempotencyRecord extends Document {
  _id: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  operation: string;        // e.g. "join_request", "accept_request"
  key: string;              // from Idempotency-Key header
  requestHash: string;      // SHA-256 of request body — reuse with different body = error
  responseStatus: number;
  responseBody: unknown;
  status: IdempotencyStatus;
  createdAt: Date;
}

const idempotencySchema = new Schema<IIdempotencyRecord>(
  {
    actorId:        { type: Schema.Types.ObjectId, ref: "User", required: true },
    operation:      { type: String, required: true },
    key:            { type: String, required: true },
    requestHash:    { type: String, required: true },
    responseStatus: { type: Number, default: 0 },
    responseBody:   { type: Schema.Types.Mixed, default: null },
    status:         { type: String, enum: ["processing", "completed", "failed"], default: "processing" },
    createdAt:      { type: Date, default: () => new Date(), immutable: true },
  },
  { timestamps: false }
);

/**
 * Unique index prevents two concurrent requests from executing the same key.
 * The unique index is on (actorId, operation, key).
 */
idempotencySchema.index({ actorId: 1, operation: 1, key: 1 }, { unique: true });
// TTL: clean up after 24 hours
idempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86_400 });

export const IdempotencyRecord: Model<IIdempotencyRecord> = mongoose.models["IdempotencyRecord"] as Model<IIdempotencyRecord>
  ?? mongoose.model<IIdempotencyRecord>("IdempotencyRecord", idempotencySchema);

// ─── OutboxEvents ─────────────────────────────────────────────────────────────

export type OutboxEventType =
  | "team.created"
  | "team.updated"
  | "team.deleted"
  | "team.member_joined"
  | "team.member_left"
  | "team.leader_changed"
  | "join_request.created"
  | "join_request.accepted"
  | "join_request.declined";

export interface IOutboxEvent extends Document {
  _id: mongoose.Types.ObjectId;
  eventType: OutboxEventType;
  aggregateId: string;      // teamId or hackathonId for fan-out
  hackathonId: mongoose.Types.ObjectId;
  payload: Record<string, unknown>;
  publishedAt: Date | null; // null = unpublished
  createdAt: Date;
}

const outboxEventSchema = new Schema<IOutboxEvent>(
  {
    eventType:   { type: String, required: true },
    aggregateId: { type: String, required: true },
    hackathonId: { type: Schema.Types.ObjectId, ref: "Hackathon", required: true },
    payload:     { type: Schema.Types.Mixed, required: true },
    publishedAt: { type: Date, default: null },
    createdAt:   { type: Date, default: () => new Date(), immutable: true },
  },
  { timestamps: false }
);

// Outbox publisher query: unpublished events in order
outboxEventSchema.index({ publishedAt: 1, createdAt: 1 });

export const OutboxEvent: Model<IOutboxEvent> = mongoose.models["OutboxEvent"] as Model<IOutboxEvent>
  ?? mongoose.model<IOutboxEvent>("OutboxEvent", outboxEventSchema);
