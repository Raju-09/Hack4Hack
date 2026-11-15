import { Request, Response, NextFunction } from "express";
import { ZodTypeAny } from "zod";
import { ValidationError } from "../utils/errors.js";

type ParseTarget = "body" | "query" | "params";

/**
 * Zod validation middleware factory.
 * Parses and coerces the specified target using the given schema.
 * Replaces the target with the parsed (safe) value on success.
 * Throws ValidationError with field-level details on failure.
 */
export function validate(schema: ZodTypeAny, target: ParseTarget = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      return next(new ValidationError("Request validation failed", details));
    }
    // Replace with parsed value (coerced, stripped of unknown keys)
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
