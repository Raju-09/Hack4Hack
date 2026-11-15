import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../middleware/validate.js";
import { authenticate, requireUser } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { RegisterSchema, LoginSchema } from "../schemas/validation.js";
import * as authService from "../services/authService.js";
import { env } from "../config/env.js";

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path:     "/",
};

// POST /api/v1/auth/register
router.post(
  "/register",
  authLimiter,
  validate(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user, tokens } = await authService.register(req.body);
      res
        .cookie("access_token",  tokens.accessToken,  { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 })
        .cookie("refresh_token", tokens.refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 })
        .status(201)
        .json({ user });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/login
router.post(
  "/login",
  authLimiter,
  validate(LoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user, tokens } = await authService.login(req.body);
      res
        .cookie("access_token",  tokens.accessToken,  { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 })
        .cookie("refresh_token", tokens.refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 })
        .json({ user });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/refresh
router.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies["refresh_token"] as string | undefined;
      if (!refreshToken) {
        res.status(401).json({ error: { code: "NO_REFRESH_TOKEN", message: "No refresh token" } });
        return;
      }
      const tokens = await authService.refreshTokens(refreshToken);
      res
        .cookie("access_token",  tokens.accessToken,  { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 })
        .cookie("refresh_token", tokens.refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 })
        .json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/logout
router.post(
  "/logout",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      await authService.logout(String(user._id));
      res
        .clearCookie("access_token",  COOKIE_OPTIONS)
        .clearCookie("refresh_token", COOKIE_OPTIONS)
        .json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
