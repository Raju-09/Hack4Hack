/**
 * Standalone Local Development Server
 *
 * Boots an in-process MongoDB WiredTiger Replica Set, synchronizes all
 * unique indexes, seeds demo hackathon teams & credentials, and starts
 * the Express REST & SSE server on port 4000.
 *
 * Enables immediate local running without Docker or manual Mongo setup.
 */

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import argon2 from "argon2";
import { connectDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import {
  User, Hackathon, Team, Membership,
  JoinRequest, InviteCode, AuditLog, IdempotencyRecord, OutboxEvent,
} from "../src/models/index.js";
import { startOutboxPublisher } from "../src/services/sseService.js";

async function main() {
  console.log("\n🚀 Starting CrewForge Standalone Development Environment...");

  // 1. Start In-Process WiredTiger Replica Set
  console.log("📦 Launching MongoDB WiredTiger Replica Set...");
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const mongoUri = replSet.getUri();
  console.log(`✅ Replica Set active at: ${mongoUri}`);

  // 2. Connect Database
  await connectDatabase(mongoUri);

  // 3. Sync Indexes
  console.log("📑 Syncing database indexes...");
  const models = [
    User, Hackathon, Team, Membership,
    JoinRequest, InviteCode, AuditLog, IdempotencyRecord, OutboxEvent,
  ];
  for (const model of models) {
    await model.syncIndexes();
  }
  console.log("✅ All collections and indexes synced.");

  // 4. Seed Demo Data
  console.log("🌱 Seeding demo hackathon, teams, and accounts...");

  const hackathon = await Hackathon.create({
    name: "Hack4Hack Crew Hiring Challenge 2026",
    slug: "hack4hack-2026",
    minTeamSize: 2,
    maxTeamSize: 4,
    status: "open",
  });

  const passwordHash = await argon2.hash("Password123!", { type: argon2.argon2id });

  // Create Demo Users
  const alex = await User.create({
    email: "demo@crewforge.com",
    passwordHash,
    displayName: "Alex Mercer",
    skills: ["TypeScript", "React", "Node.js", "MongoDB"],
    timezone: "UTC",
    experienceLevel: "advanced",
    availability: 6,
    bio: "Fullstack engineer passionate about race-safe distributed systems.",
    discoverable: true,
  });

  const priya = await User.create({
    email: "priya@crewforge.com",
    passwordHash,
    displayName: "Priya Sharma",
    skills: ["Python", "FastAPI", "ML", "PyTorch"],
    timezone: "Asia/Kolkata",
    experienceLevel: "advanced",
    availability: 5,
    bio: "AI researcher building generative pipelines.",
    discoverable: true,
  });

  const david = await User.create({
    email: "david@crewforge.com",
    passwordHash,
    displayName: "David Kim",
    skills: ["UI/UX", "Figma", "TailwindCSS", "React"],
    timezone: "America/New_York",
    experienceLevel: "intermediate",
    availability: 4,
    bio: "Product designer crafting accessible and intuitive interfaces.",
    discoverable: true,
  });

  const sara = await User.create({
    email: "sara@crewforge.com",
    passwordHash,
    displayName: "Sara Chen",
    skills: ["Go", "Kubernetes", "AWS", "Redis"],
    timezone: "Europe/London",
    experienceLevel: "advanced",
    availability: 5,
    bio: "Cloud infrastructure and resilience engineer.",
    discoverable: true,
  });

  // Create Demo Teams
  const team1 = await Team.create({
    hackathonId: hackathon._id,
    name: "CyberShield AI",
    description: "Building zero-trust authentication monitoring for cloud endpoints.",
    leaderId: priya._id,
    memberCount: 2,
    maxMembers: 4,
    skillsNeeded: ["Python", "FastAPI", "ML"],
    lookingForMembers: true,
  });
  await Membership.create([
    { hackathonId: hackathon._id, teamId: team1._id, userId: priya._id, role: "leader" },
    { hackathonId: hackathon._id, teamId: team1._id, userId: sara._id, role: "member" },
  ]);

  const team2 = await Team.create({
    hackathonId: hackathon._id,
    name: "CloudScale Systems",
    description: "High-throughput real-time stream aggregation engine.",
    leaderId: alex._id,
    memberCount: 1,
    maxMembers: 3,
    skillsNeeded: ["TypeScript", "React", "UI/UX"],
    lookingForMembers: true,
  });
  await Membership.create([
    { hackathonId: hackathon._id, teamId: team2._id, userId: alex._id, role: "leader" },
  ]);

  const team3 = await Team.create({
    hackathonId: hackathon._id,
    name: "DesignCraft Studio",
    description: "Design-first generative UI kit for hackathon projects.",
    leaderId: david._id,
    memberCount: 1,
    maxMembers: 2,
    skillsNeeded: ["React", "TypeScript"],
    lookingForMembers: true,
  });
  await Membership.create([
    { hackathonId: hackathon._id, teamId: team3._id, userId: david._id, role: "leader" },
  ]);

  console.log("✅ Seed completed successfully!");

  // 5. Start Server
  const app = createApp();
  const port = env.PORT || 4000;

  // Start background outbox poller for real-time SSE
  startOutboxPublisher();

  const server = app.listen(port, () => {
    console.log("\n=======================================================");
    console.log(`🎉 CrewForge API is LIVE on: http://localhost:${port}`);
    console.log("=======================================================");
    console.log("🔑 Demo Credentials:");
    console.log("   Email:    demo@crewforge.com");
    console.log("   Password: Password123!");
    console.log("   Role:     Team Leader (CloudScale Systems)");
    console.log("-------------------------------------------------------");
    console.log("   Email:    priya@crewforge.com");
    console.log("   Password: Password123!");
    console.log("   Role:     Team Leader (CyberShield AI)");
    console.log("=======================================================");
    console.log("📡 Frontend can now be started via: cd client && npm run dev");
    console.log("   Preview URL: http://localhost:5173\n");
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n🛑 Stopping servers...");
    server.close();
    await mongoose.disconnect();
    await replSet.stop();
    console.log("👋 Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("❌ Fatal error during startup:", err);
  process.exit(1);
});
