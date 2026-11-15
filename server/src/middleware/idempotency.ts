import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { IdempotencyRecord } from "../models/index.js";
import { hashPayload } from "../utils/crypto.js";
import { requireUser } from "./auth.js";
import { ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const MAX_KEY_LENGTH = 128;

/**
 * Persistent idempotency middleware factory.
 *
 * Usage: router.post('/join-requests', idempotency('join_request'), handler)
 *
 * How it works:
 * 1. Read `Idempotency-Key` header.
 * 2. Look up (actorId, operation, key) in idempotencyRecords.
 * 3. If found + completed → return cached response immediately.
 * 4. If found + processing → return 409 (concurrent duplicate).
 * 5. If found + different payload hash → return 422 (key reuse with different body).
 * 6. If not found → insert record (status=processing) → continue to handler.
 * 7. After handler → update record to completed with response.
 *
 * The unique index on (actorId, operation, key) ensures that two concurrent
 * requests with the same key cannot both proceed past step 6.
 */
export function idempotency(operation: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    // Idempotency-Key is optional. Skip middleware if not provided.
    if (!idempotencyKey) {
      return next();
    }

    if (idempotencyKey.length > MAX_KEY_LENGTH) {
      return next(new ValidationError("Idempotency-Key too long (max 128 chars)"));
    }

    const user = requireUser(req);
    const actorId = user._id;
    const requestHash = hashPayload(req.body);

    try {
      // Check for existing record
      const existing = await IdempotencyRecord.findOne({
        actorId,
        operation,
        key: idempotencyKey,
      }).lean();

      if (existing) {
        // Key reuse with different payload
        if (existing.requestHash !== requestHash) {
          return next(
            new ValidationError(
              "Idempotency-Key reused with a different request payload"
            )
          );
        }

        // Concurrent duplicate — still processing
        if (existing.status === "processing") {
          res.status(409).json({
            error: {
              code: "IDEMPOTENCY_CONFLICT",
              message: "A request with this Idempotency-Key is already being processed",
            },
          });
          return;
        }

        // Already completed — return cached response
        logger.debug("Idempotency cache hit", { operation, key: idempotencyKey });
        res.status(existing.responseStatus).json(existing.responseBody);
        return;
      }

      // Insert processing record — unique index prevents concurrent duplicates
      try {
        await IdempotencyRecord.create({
          actorId,
          operation,
          key: idempotencyKey,
          requestHash,
          status: "processing",
        });
      } catch (err) {
        if (
          err instanceof mongoose.mongo.MongoServerError &&
          err.code === 11000
        ) {
          // Race: another request inserted the record concurrently
          res.status(409).json({
            error: {
              code: "IDEMPOTENCY_CONFLICT",
              message: "A request with this Idempotency-Key is already being processed",
            },
          });
          return;
        }
        throw err;
      }

      // Intercept res.json to capture response for caching
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        // Update idempotency record with response (fire-and-forget, non-blocking)
        const finalStatus: "completed" | "failed" = res.statusCode < 500 ? "completed" : "failed";
        IdempotencyRecord.updateOne(
          { actorId, operation, key: idempotencyKey },
          {
            $set: {
              responseStatus: res.statusCode,
              responseBody: body,
              status: finalStatus,
            },
          }
        ).catch((updateErr: Error) => {
          logger.warn("Failed to update idempotency record", { error: updateErr.message });
        });
        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
