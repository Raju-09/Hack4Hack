import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

let isConnected = false;

export async function connectDatabase(uri?: string): Promise<void> {
  if (isConnected) return;

  const mongoUri = uri ?? env.MONGODB_URI;

  mongoose.set("strictQuery", true);

  // Ensure replica set for transactions
  if (!mongoUri.includes("replicaSet") && !mongoUri.includes("rs0") && env.NODE_ENV === "production") {
    throw new Error("MONGODB_URI must point to a replica set for transaction support");
  }

  await mongoose.connect(mongoUri, {
    // Connection pool settings
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    // Write concern: majority for durability
    w: "majority",
    wtimeoutMS: 10_000,
  });

  isConnected = true;
  logger.info(`MongoDB connected: ${mongoose.connection.host}`);

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
    logger.warn("MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    isConnected = true;
    logger.info("MongoDB reconnected");
  });

  mongoose.connection.on("error", (err) => {
    logger.error("MongoDB error", { error: err.message });
  });
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}

/**
 * Run a function inside a MongoDB session/transaction.
 * Automatically retries on transient transaction errors.
 */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 5000,
    });
    return result;
  } finally {
    await session.endSession();
  }
}
