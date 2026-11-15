import { Router, Request, Response, NextFunction } from "express";
import { authenticate, requireUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { generalLimiter } from "../middleware/rateLimiter.js";
import { UpdateProfileSchema } from "../schemas/validation.js";
import { User, Membership, JoinRequest } from "../models/index.js";
import { toPublicUser } from "../services/authService.js";
import { withTransaction } from "../config/database.js";
import mongoose from "mongoose";

const router = Router();

// GET /api/v1/me
router.get(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.json({ user: toPublicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/me
router.patch(
  "/",
  authenticate,
  generalLimiter,
  validate(UpdateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const updated = await User.findByIdAndUpdate(
        user._id,
        { $set: req.body },
        { new: true }
      ).lean();
      res.json({ user: toPublicUser(updated as unknown as typeof user) });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/me/discoverable
router.patch(
  "/discoverable",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const discoverable: boolean = Boolean(req.body.discoverable);
      await User.updateOne({ _id: user._id }, { $set: { discoverable } });
      res.json({ discoverable });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/me/data  (GDPR export)
router.get(
  "/data",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const memberships = await Membership.find({ userId: user._id }).lean();
      const requests    = await JoinRequest.find({ userId: user._id }).lean();
      res.json({
        user: toPublicUser(user),
        memberships: memberships.map((m) => ({
          teamId: String(m.teamId),
          role:   m.role,
          joinedAt: m.joinedAt,
        })),
        joinRequests: requests.map((r) => ({
          teamId:  String(r.teamId),
          status:  r.status,
          createdAt: r.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/me  (GDPR erasure — soft delete)
router.delete(
  "/",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      await withTransaction(async (session) => {
        // Tombstone the user record
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              deletedAt:    new Date(),
              email:        `deleted_${user._id}@tombstone`,
              displayName:  "Deleted User",
              bio:          "",
              skills:       [],
              discoverable: false,
            },
          },
          { session }
        );
        // Cancel pending join requests
        await JoinRequest.updateMany(
          { userId: user._id, status: "pending" },
          { $set: { status: "cancelled" } },
          { session }
        );
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
