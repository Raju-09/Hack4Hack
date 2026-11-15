import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import { User, IUser } from "../models/index.js";
import { env } from "../config/env.js";
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from "../utils/errors.js";
import { logger } from "../utils/logger.js";

/** Argon2id configuration per OWASP recommendations */
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  _id: string;
  displayName: string;
  skills: string[];
  timezone: string;
  experienceLevel: string;
  availability: number;
  bio: string;
  discoverable: boolean;
  createdAt: Date;
}

export function toPublicUser(user: IUser): PublicUser {
  return {
    _id:             String(user._id),
    displayName:     user.displayName,
    skills:          user.skills,
    timezone:        user.timezone,
    experienceLevel: user.experienceLevel,
    availability:    user.availability,
    bio:             user.bio,
    discoverable:    user.discoverable,
    createdAt:       user.createdAt,
  };
}

function signAccessToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: "access" },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRY,
      issuer: "crewforge",
      audience: "crewforge-client",
    } as jwt.SignOptions
  );
}

function signRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: "refresh" },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRY,
      issuer: "crewforge",
      audience: "crewforge-client",
    } as jwt.SignOptions
  );
}

export async function register(input: {
  displayName: string;
  email: string;
  password: string;
  skills: string[];
  timezone: string;
  experienceLevel: "beginner" | "intermediate" | "advanced";
  availability: number;
  bio: string;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  // Check duplicate email
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    throw new ConflictError("EMAIL_TAKEN", "An account with this email already exists");
  }

  const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

  const user = await User.create({
    displayName:     input.displayName,
    email:           input.email,
    passwordHash,
    skills:          input.skills,
    timezone:        input.timezone,
    experienceLevel: input.experienceLevel,
    availability:    input.availability,
    bio:             input.bio,
    discoverable:    false,
  });

  logger.info("User registered", { userId: user._id });

  const accessToken  = signAccessToken(String(user._id));
  const refreshToken = signRefreshToken(String(user._id));

  // Store hashed refresh token for future revocation
  const refreshHash = createHash("sha256").update(refreshToken).digest("hex");
  await User.updateOne({ _id: user._id }, { $set: { refreshTokenHash: refreshHash } });

  return {
    user: toPublicUser(user),
    tokens: { accessToken, refreshToken },
  };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  // Always fetch with password hash (select: false field)
  const user = await User.findOne({ email: input.email, deletedAt: null })
    .select("+passwordHash")
    .lean();

  // Constant-time response to prevent user enumeration
  if (!user) {
    await argon2.hash("dummy_to_prevent_timing_attack", ARGON2_OPTIONS);
    throw new UnauthorizedError("Invalid email or password");
  }

  const valid = await argon2.verify(user.passwordHash, input.password, ARGON2_OPTIONS);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const accessToken  = signAccessToken(String(user._id));
  const refreshToken = signRefreshToken(String(user._id));

  const refreshHash = createHash("sha256").update(refreshToken).digest("hex");
  await User.updateOne({ _id: user._id }, { $set: { refreshTokenHash: refreshHash } });

  logger.info("User logged in", { userId: user._id });

  return {
    user: toPublicUser(user as unknown as IUser),
    tokens: { accessToken, refreshToken },
  };
}

export async function logout(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $set: { refreshTokenHash: null } });
  logger.info("User logged out", { userId });
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  let payload: { sub: string; type: string };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
      issuer: "crewforge",
      audience: "crewforge-client",
    }) as { sub: string; type: string };
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (payload.type !== "refresh") {
    throw new UnauthorizedError("Invalid token type");
  }

  const user = await User.findById(payload.sub).select("+refreshTokenHash").lean();
  if (!user || user.deletedAt) {
    throw new UnauthorizedError("User not found");
  }

  const incomingHash = createHash("sha256").update(refreshToken).digest("hex");
  if (incomingHash !== user.refreshTokenHash) {
    // Token reuse detected — potential theft — revoke all
    await User.updateOne({ _id: user._id }, { $set: { refreshTokenHash: null } });
    throw new UnauthorizedError("Refresh token reuse detected. Please login again.");
  }

  const newAccessToken  = signAccessToken(String(user._id));
  const newRefreshToken = signRefreshToken(String(user._id));
  const newRefreshHash  = createHash("sha256").update(newRefreshToken).digest("hex");

  await User.updateOne({ _id: user._id }, { $set: { refreshTokenHash: newRefreshHash } });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
