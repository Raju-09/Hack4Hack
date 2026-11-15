import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { startOutboxPublisher } from "./services/sseService.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

async function main() {
  await connectDatabase();
  await startOutboxPublisher();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`CrewForge API server started`, {
      port: env.PORT,
      env:  env.NODE_ENV,
    });
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(async () => {
      const { disconnectDatabase } = await import("./config/database.js");
      const { stopOutboxPublisher } = await import("./services/sseService.js");
      stopOutboxPublisher();
      await disconnectDatabase();
      logger.info("Server shut down cleanly");
      process.exit(0);
    });
    // Force exit after 10 seconds
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT",  () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
