import { Response } from "express";
import { OutboxEvent, IOutboxEvent } from "../models/index.js";
import { logger } from "../utils/logger.js";

// ─── SSE Client Registry ──────────────────────────────────────────────────────

interface SseClient {
  id: string;
  res: Response;
  hackathonId: string;
  userId?: string;
  lastEventId: number;
}

const clients = new Map<string, SseClient>();

export function addSseClient(client: SseClient): void {
  clients.set(client.id, client);
  logger.debug("SSE client connected", { clientId: client.id, total: clients.size });
}

export function removeSseClient(clientId: string): void {
  clients.delete(clientId);
  logger.debug("SSE client disconnected", { clientId, total: clients.size });
}

/**
 * Broadcast an SSE event to all clients subscribed to the same hackathon.
 * Payload must never contain private fields (email, tokens, etc.).
 */
export function broadcast(hackathonId: string, event: {
  id: string;
  type: string;
  data: Record<string, unknown>;
}): void {
  for (const client of clients.values()) {
    if (client.hackathonId !== hackathonId) continue;
    try {
      const payload =
        `id: ${event.id}\n` +
        `event: ${event.type}\n` +
        `data: ${JSON.stringify(event.data)}\n\n`;
      client.res.write(payload);
    } catch (err) {
      logger.warn("SSE write failed", { clientId: client.id, error: (err as Error).message });
      clients.delete(client.id);
    }
  }
}

// ─── Outbox Publisher ─────────────────────────────────────────────────────────

let publisherInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Polls the outbox for unpublished events and broadcasts them via SSE.
 * Only reads events that were committed to the database — no phantom broadcasts.
 *
 * Uses polling (500 ms) rather than change streams for simplicity.
 * In production, switch to MongoDB change streams or a message broker.
 */
export async function startOutboxPublisher(): Promise<void> {
  if (publisherInterval) return;

  async function poll() {
    try {
      const unpublished = await OutboxEvent.find({ publishedAt: null })
        .sort({ createdAt: 1 })
        .limit(100)
        .lean();

      for (const event of unpublished) {
        const hackathonId = String(event.hackathonId);
        broadcast(hackathonId, {
          id:   String(event._id),
          type: event.eventType,
          data: event.payload,
        });

        await OutboxEvent.updateOne(
          { _id: event._id, publishedAt: null },
          { $set: { publishedAt: new Date() } }
        );
      }
    } catch (err) {
      logger.warn("Outbox publisher error", { error: (err as Error).message });
    }
  }

  publisherInterval = setInterval(() => void poll(), 500);
  logger.info("Outbox publisher started");
}

export function stopOutboxPublisher(): void {
  if (publisherInterval) {
    clearInterval(publisherInterval);
    publisherInterval = null;
  }
}
