import { Request, Response, NextFunction } from "express";
import { AppError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import mongoose from "mongoose";

/**
 * Central error handler. Maps all thrown errors to consistent JSON responses.
 * Must be registered as the LAST middleware in Express.
 *
 * Response envelope:
 * { "error": { "code": "...", "message": "...", "requestId": "...", "details"?: ... } }
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId ?? "unknown";

  // ── Map known error types ──────────────────────────────────────────────────

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error("Application error", {
        code: err.code,
        message: err.message,
        requestId,
        stack: err.stack,
      });
    } else {
      logger.warn("Client error", {
        code: err.code,
        message: err.message,
        requestId,
        path: req.path,
      });
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err instanceof ValidationError && err.details
          ? { details: err.details }
          : {}),
      },
    });
    return;
  }

  // MongoDB duplicate key error (11000) — happens when unique index fires
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
    logger.warn("MongoDB duplicate key", {
      keyPattern: (err as { keyPattern?: unknown }).keyPattern,
      requestId,
    });
    res.status(409).json({
      error: {
        code: "DUPLICATE_KEY",
        message: "A conflicting record already exists",
        requestId,
      },
    });
    return;
  }

  // Mongoose validation error
  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Database validation failed",
        requestId,
        details: err.errors,
      },
    });
    return;
  }

  // Mongoose cast error (invalid ObjectId)
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Invalid ID format",
        requestId,
      },
    });
    return;
  }

  // Unknown errors
  logger.error("Unhandled error", {
    message: err instanceof Error ? err.message : String(err),
    stack:   err instanceof Error ? err.stack : undefined,
    requestId,
  });

  // Never expose stack traces in production
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      requestId,
    },
  });
}
