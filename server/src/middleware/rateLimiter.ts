import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { env } from "../config/env.js";

function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    error: {
      code: "RATE_LIMIT",
      message: "Too many requests. Please slow down.",
    },
  });
}

/** General API rate limiter */
export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => (req.user ? String(req.user._id) : (req.ip ?? "unknown")),
});

/** Stricter limiter for auth endpoints */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => req.ip ?? "unknown",
});

/** Invite redemption — separate limiter to prevent brute-force */
export const inviteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => (req.user ? String(req.user._id) : (req.ip ?? "unknown")),
});

/** Join request — prevent spam */
export const joinLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => (req.user ? String(req.user._id) : (req.ip ?? "unknown")),
});
