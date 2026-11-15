import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Generate a cryptographically secure invite token.
 * Returns the raw token (returned to caller once) and its SHA-256 hash
 * (stored in the database — never the raw token).
 *
 * Entropy: 32 bytes = 256 bits (brute-force infeasible)
 */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Timing-safe comparison of two tokens.
 * Prevents timing attacks on invite redemption.
 */
export function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Generate an idempotency key record hash from request body.
 * Used to detect payload changes on key reuse.
 */
export function hashPayload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Generate a request ID for correlation.
 */
export function generateRequestId(): string {
  return randomBytes(8).toString("hex");
}
