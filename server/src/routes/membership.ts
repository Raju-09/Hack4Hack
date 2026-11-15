import { Router, Request, Response, NextFunction } from "express";
import { authenticate, requireUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { idempotency } from "../middleware/idempotency.js";
import { joinLimiter, generalLimiter } from "../middleware/rateLimiter.js";
import { CreateJoinRequestSchema, LeaveTeamSchema } from "../schemas/validation.js";
import * as membershipService from "../services/membershipService.js";
import { z } from "zod";

const router = Router();

// POST /api/v1/teams/:id/join-requests  (US-03)
router.post(
  "/:id/join-requests",
  authenticate,
  joinLimiter,
  idempotency("join_request"),
  validate(CreateJoinRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const teamId = String(req.params["id"] || "");
      const result = await membershipService.createJoinRequest({
        teamId,
        userId:  String(user._id),
        message: req.body.message ?? "",
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/teams/:id/join-requests (leader inbox)
router.get(
  "/:id/join-requests",
  authenticate,
  generalLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const teamId = String(req.params["id"] || "");
      const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;
      const requests = await membershipService.getTeamJoinRequests({
        teamId,
        actorId: String(user._id),
        status,
      });
      res.json({ requests });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/teams/:id/leave  (US-06)
router.post(
  "/:id/leave",
  authenticate,
  generalLimiter,
  idempotency("leave_team"),
  validate(LeaveTeamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const teamId = String(req.params["id"] || "");
      const result = await membershipService.leaveTeam({
        teamId,
        userId:      String(user._id),
        successorId: req.body.successorId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/teams/:id/members/:userId  (US-07)
router.delete(
  "/:id/members/:userId",
  authenticate,
  generalLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requireUser(req);
      const teamId = String(req.params["id"] || "");
      const targetUserId = String(req.params["userId"] || "");
      await membershipService.removeMember({
        teamId,
        actorId:      String(actor._id),
        targetUserId,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/join-requests/:id/accept  (US-04)
router.post(
  "/requests/:id/accept",
  authenticate,
  generalLimiter,
  idempotency("accept_request"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requireUser(req);
      const requestId = String(req.params["id"] || "");
      const result = await membershipService.acceptJoinRequest({
        requestId,
        actorId:   String(actor._id),
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/join-requests/:id/decline  (US-05)
router.post(
  "/requests/:id/decline",
  authenticate,
  generalLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requireUser(req);
      const requestId = String(req.params["id"] || "");
      await membershipService.declineJoinRequest({
        requestId,
        actorId:   String(actor._id),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
