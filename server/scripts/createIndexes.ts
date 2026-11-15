import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import {
  User,
  Hackathon,
  Team,
  Membership,
  JoinRequest,
  InviteCode,
  AuditLog,
  IdempotencyRecord,
  OutboxEvent,
} from "../src/models/index.js";
import { logger } from "../src/utils/logger.js";

async function run() {
  logger.info("Initializing database indexes...");
  await connectDatabase();

  const models = [
    User,
    Hackathon,
    Team,
    Membership,
    JoinRequest,
    InviteCode,
    AuditLog,
    IdempotencyRecord,
    OutboxEvent,
  ];

  for (const model of models) {
    logger.info(`Syncing indexes for ${model.modelName}...`);
    await model.syncIndexes();
  }

  logger.info("✅ All collections and indexes synced successfully!");
  await disconnectDatabase();
}

run().catch((err) => {
  logger.error("Failed to build indexes", { error: err.message });
  process.exit(1);
});
