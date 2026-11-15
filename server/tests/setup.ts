import { beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";

let replSet: MongoMemoryReplSet | null = null;

beforeAll(async () => {
  let uri = process.env["TEST_MONGO_URI"];

  if (!uri) {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    uri = replSet.getUri();
  }

  process.env["NODE_ENV"]           = "test";
  process.env["MONGODB_URI"]        = uri;
  process.env["JWT_SECRET"]         = "test_jwt_secret_at_least_32_characters_long!";
  process.env["JWT_REFRESH_SECRET"] = "test_refresh_secret_at_least_32_characters!!";
  process.env["COOKIE_SECRET"]      = "test_cookie_secret_16chars";
  process.env["JWT_ACCESS_EXPIRY"]  = "15m";
  process.env["JWT_REFRESH_EXPIRY"] = "7d";
  process.env["CLIENT_ORIGIN"]      = "http://localhost:5173";
  process.env["RATE_LIMIT_WINDOW_MS"] = "60000";
  process.env["RATE_LIMIT_MAX"]     = "1000";
  process.env["LOG_LEVEL"]          = "warn";

  await connectDatabase(uri);
}, 90_000);

afterAll(async () => {
  await disconnectDatabase();
  if (replSet) {
    await replSet.stop();
  }
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.listCollections().toArray();
  await Promise.all(
    collections
      .filter((c) => !c.name.startsWith("system."))
      .map((c) => db.collection(c.name).deleteMany({}))
  );
});
