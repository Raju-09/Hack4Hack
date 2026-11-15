import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User, IUser } from "../models/index.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";

// Extend Express Request with authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      requestId?: string;
    }
  }
}

interface JwtPayload {
  sub: string;    // userId
  type: "access";
  iat: number;
  exp: number;
}

/**
 * Verifies the JWT access token from the cookie.
 * Attaches `req.user` on success. Throws UnauthorizedError on failure.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token: string | undefined = req.cookies?.["access_token"] as string | undefined;

    if (!token) {
      throw new UnauthorizedError("No authentication token provided");
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        issuer: "crewforge",
        audience: "crewforge-client",
      }) as JwtPayload;
    } catch (err) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    if (payload.type !== "access") {
      throw new UnauthorizedError("Invalid token type");
    }

    const user = await User.findById(payload.sub).select("+passwordHash").lean();
    if (!user || user.deletedAt) {
      throw new UnauthorizedError("User account not found or deleted");
    }

    req.user = user as unknown as IUser;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional auth — attaches user if token present, continues if not.
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token: string | undefined = req.cookies?.["access_token"] as string | undefined;
  if (!token) return next();
  return authenticate(req, res, next);
}

/**
 * Utility: assert user is authenticated (throws if not).
 */
export function requireUser(req: Request): IUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
