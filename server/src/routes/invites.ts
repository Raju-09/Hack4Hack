import { Router, Request, Response, NextFunction } from "express";
import { authenticate, requireUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { idempotency } from "../middleware/idempotency.js";
import { inviteLimiter, generalLimiter } from "../middleware/rateLimiter.js";
import { CreateInviteSchema } from "../schemas/validation.js";
import * as inviteService from "../services/inviteService.js";
import { env } from "../config/env.js";

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
};

// POST /api/v1/teams/:id/invites
router.post(
  "/:id/invites",
  authenticate,
  generalLimiter,
  validate(CreateInviteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const teamId = String(req.params["id"] || "");
      const result = await inviteService.createInvite({
        teamId,
        actorId:        String(user._id),
        expiresInHours: req.body.expiresInHours,
        maxUses:        req.body.maxUses,
      });
      // Raw token returned once
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/teams/:id/invites
router.get(
  "/:id/invites",
  authenticate,
  generalLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const teamId = String(req.params["id"] || "");
      const invites = await inviteService.listTeamInvites({
        teamId,
        actorId: String(user._id),
      });
      res.json({ invites });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/teams/:id/invites/:inviteId/revoke
router.patch(
  "/:id/invites/:inviteId/revoke",
  authenticate,
  generalLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const inviteId = String(req.params["inviteId"] || "");
      await inviteService.revokeInvite({
        inviteId,
        actorId:  String(user._id),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/invites/:code/redeem  (US-02)
router.post(
  "/redeem/:code",
  authenticate,
  inviteLimiter,
  idempotency("redeem_invite"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const code = String(req.params["code"] || "");
      const result = await inviteService.redeemInvite({
        token:  code,
        userId: String(user._id),
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
