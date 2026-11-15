import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { optionalAuthenticate } from "../middleware/auth.js";
import { addSseClient, removeSseClient } from "../services/sseService.js";
import { logger } from "../utils/logger.js";

const router = Router();

/**
 * GET /api/v1/events?hackathonId=...
 * Server-Sent Events endpoint for real-time board and notification updates.
 *
 * Uses event IDs for reconnect support.
 * Clients should re-fetch authoritative state after reconnect — SSE is
 * notification only, not the source of truth.
 *
 * Authentication is optional — public hackathon events are broadcast to all.
 * Private (user-specific) events would require authentication, but for MVP
 * we broadcast team events to all hackathon subscribers.
 */
router.get(
  "/",
  optionalAuthenticate,
  (req: Request, res: Response, _next: NextFunction) => {
    const hackathonId = req.query["hackathonId"] as string | undefined;
    if (!hackathonId) {
      res.status(400).json({ error: { code: "MISSING_HACKATHON_ID", message: "hackathonId query parameter is required" } });
      return;
    }

    const clientId   = randomUUID();
    const lastEventId = parseInt(req.headers["last-event-id"] as string ?? "0") || 0;

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",   // Nginx: disable buffering
    });

    // Send initial connection confirmation
    res.write(`id: 0\nevent: connected\ndata: ${JSON.stringify({ clientId, hackathonId })}\n\n`);

    // Keep-alive ping every 15 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 15_000);

    addSseClient({
      id:          clientId,
      res,
      hackathonId,
      userId:      req.user ? String(req.user._id) : undefined,
      lastEventId,
    });

    req.on("close", () => {
      clearInterval(heartbeat);
      removeSseClient(clientId);
      logger.debug("SSE connection closed", { clientId });
    });
  }
);

export default router;
