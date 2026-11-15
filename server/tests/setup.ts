import { beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";

// Use a test-specific database to avoid polluting development data
const TEST_MONGO_URI =
  process.env["TEST_MONGO_URI"] ??
  "mongodb://localhost:27017,localhost:27018,localhost:27019/crewforge_test?replicaSet=rs0";

beforeAll(async () => {
  // Set env variables required by config/env
  process.env["NODE_ENV"]           = "test";
  process.env["MONGODB_URI"]        = TEST_MONGO_URI;
  process.env["JWT_SECRET"]         = "test_jwt_secret_at_least_32_characters_long!";
  process.env["JWT_REFRESH_SECRET"] = "test_refresh_secret_at_least_32_characters!!";
  process.env["COOKIE_SECRET"]      = "test_cookie_secret_16chars";
  process.env["JWT_ACCESS_EXPIRY"]  = "15m";
  process.env["JWT_REFRESH_EXPIRY"] = "7d";
  process.env["CLIENT_ORIGIN"]      = "http://localhost:5173";
  process.env["RATE_LIMIT_WINDOW_MS"] = "60000";
  process.env["RATE_LIMIT_MAX"]     = "1000";  // relaxed for tests
  process.env["LOG_LEVEL"]          = "warn";  // suppress noise in tests

  await connectDatabase(TEST_MONGO_URI);
}, 30_000);

afterAll(async () => {
  await disconnectDatabase();
});

beforeEach(async () => {
  // Clean all collections before each test for isolation
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.listCollections().toArray();
  await Promise.all(
    collections
      .filter((c) => !c.name.startsWith("system."))
      .map((c) => db.collection(c.name).deleteMany({}))
  );
});
