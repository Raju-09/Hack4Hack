import { Router, Request, Response, NextFunction } from "express";
import { authenticate, requireUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { generalLimiter } from "../middleware/rateLimiter.js";
import { CreateTeamSchema, UpdateTeamSchema, TeamQuerySchema } from "../schemas/validation.js";
import * as teamService from "../services/teamService.js";
import { AuditLog } from "../models/index.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";

const router = Router();

// GET /api/v1/teams
router.get(
  "/",
  generalLimiter,
  validate(TeamQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as {
        hackathonId?: string; skills?: string[]; looking?: boolean;
        timezone?: string; limit: number; cursor?: string;
      };
      const result = await teamService.listTeams(query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/teams
router.post(
  "/",
  authenticate,
  generalLimiter,
  validate(CreateTeamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const team = await teamService.createTeam({
        ...req.body,
        creatorId: String(user._id),
      });
      res.status(201).json({ team });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/teams/:id
router.get(
  "/:id",
  generalLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const teamId = String(req.params["id"] || "");
      const team = await teamService.getTeam(teamId);
      const members = await teamService.getTeamMembers(teamId);
      res.json({ team, members });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/teams/:id
router.patch(
  "/:id",
  authenticate,
  generalLimiter,
  validate(UpdateTeamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const teamId = String(req.params["id"] || "");
      const team = await teamService.updateTeam({
        teamId,
        actorId: String(user._id),
        ...req.body,
      });
      res.json({ team });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/teams/:id/audit
router.get(
  "/:id/audit",
  authenticate,
  generalLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const teamId = String(req.params["id"] || "");
      // Only team members can view audit log
      const { getTeamMembers } = await import("../services/teamService.js");
      const members = await getTeamMembers(teamId);
      const isMember = members.some((m) => m.userId === String(user._id));
      if (!isMember) throw new ForbiddenError("Only team members can view audit logs");

      const logs = await AuditLog.find({ teamId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      res.json({
        logs: logs.map((l) => ({
          _id:       String(l._id),
          actorId:   String(l.actorId),
          action:    l.action,
          targetId:  l.targetId ? String(l.targetId) : null,
          metadata:  l.metadata,
          createdAt: l.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
