import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  displayName:     z.string().min(2).max(80).trim(),
  email:           z.string().email().toLowerCase(),
  password:        z.string().min(8).max(128),
  skills:          z.array(z.string().min(1).max(50)).max(20).default([]),
  timezone:        z.string().default("UTC"),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
  availability:    z.number().min(0).max(24).default(4),
  bio:             z.string().max(500).default(""),
});

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ─── Teams ────────────────────────────────────────────────────────────────────

export const CreateTeamSchema = z.object({
  hackathonId:       z.string().length(24),
  name:              z.string().min(2).max(80).trim(),
  description:       z.string().max(500).default(""),
  maxMembers:        z.number().int().min(2).max(10),
  skillsNeeded:      z.array(z.string().min(1).max(50)).max(20).default([]),
  lookingForMembers: z.boolean().default(true),
});

export const UpdateTeamSchema = z.object({
  name:              z.string().min(2).max(80).trim().optional(),
  description:       z.string().max(500).optional(),
  skillsNeeded:      z.array(z.string().min(1).max(50)).max(20).optional(),
  lookingForMembers: z.boolean().optional(),
});

export const TeamQuerySchema = z.object({
  hackathonId: z.string().length(24).optional(),
  skills:      z.union([z.string(), z.array(z.string())]).optional().transform((v) =>
    v === undefined ? undefined : Array.isArray(v) ? v : [v]
  ),
  looking:     z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  timezone:    z.string().optional(),
  limit:       z.coerce.number().min(1).max(50).default(20),
  cursor:      z.string().optional(),   // base64-encoded last _id for cursor pagination
});

// ─── JoinRequests ─────────────────────────────────────────────────────────────

export const CreateJoinRequestSchema = z.object({
  message: z.string().max(300).default(""),
});

// ─── Leave / Transfer ─────────────────────────────────────────────────────────

export const LeaveTeamSchema = z.object({
  successorId: z.string().length(24).optional(),  // leader can optionally pre-select successor
});

// ─── Invites ──────────────────────────────────────────────────────────────────

export const CreateInviteSchema = z.object({
  expiresInHours: z.number().int().min(1).max(168).default(24),  // 1h to 7d
  maxUses:        z.number().int().min(1).max(100).default(1),
});

// ─── Profile ──────────────────────────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
  displayName:     z.string().min(2).max(80).trim().optional(),
  skills:          z.array(z.string().min(1).max(50)).max(20).optional(),
  timezone:        z.string().optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  availability:    z.number().min(0).max(24).optional(),
  bio:             z.string().max(500).optional(),
  discoverable:    z.boolean().optional(),
});

// ─── Discovery ────────────────────────────────────────────────────────────────

export const DiscoveryQuerySchema = z.object({
  hackathonId: z.string().length(24),
  teamId:      z.string().length(24).optional(),  // find matches for a specific team's needs
  limit:       z.coerce.number().min(1).max(50).default(20),
});
