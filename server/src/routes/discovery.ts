import { Router, Request, Response, NextFunction } from "express";
import { authenticate, optionalAuthenticate, requireUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { generalLimiter } from "../middleware/rateLimiter.js";
import { DiscoveryQuerySchema, UpdateProfileSchema } from "../schemas/validation.js";
import * as discoveryService from "../services/discoveryService.js";
import { User } from "../models/index.js";
import { NotFoundError } from "../utils/errors.js";
import { toPublicUser } from "../services/authService.js";

const router = Router();

// GET /api/v1/discovery/matches  (US-09)
router.get(
  "/matches",
  authenticate,
  generalLimiter,
  validate(DiscoveryQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const query = req.query as unknown as {
        hackathonId: string; teamId?: string; limit: number;
      };
      const matches = await discoveryService.getDiscoveryMatches({
        hackathonId:      query.hackathonId,
        teamId:           query.teamId,
        requestingUserId: String(user._id),
        limit:            query.limit,
      });
      res.json({ matches });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
