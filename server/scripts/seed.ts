/**
 * Seed script: 10,000 users + 2,000 teams for load testing.
 * Run with: npm run seed
 *
 * Uses bulk insertions for performance.
 * Ensures unique email constraints are respected.
 */

import mongoose from "mongoose";
import argon2 from "argon2";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { User, Hackathon, Team, Membership } from "../src/models/index.js";
import { env } from "../src/config/env.js";

const SKILLS = [
  "react", "vue", "angular", "typescript", "javascript",
  "node", "express", "python", "django", "fastapi",
  "java", "spring", "go", "rust", "mongodb",
  "postgresql", "redis", "docker", "kubernetes", "ml",
  "tensorflow", "pytorch", "aws", "gcp", "azure",
  "figma", "ui-design", "ux-research", "mobile", "flutter",
];

const TIMEZONES = [
  "UTC", "Asia/Kolkata", "America/New_York", "America/Los_Angeles",
  "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Singapore",
  "Australia/Sydney", "America/Chicago",
];

const EXPERIENCE = ["beginner", "intermediate", "advanced"] as const;

function randomItem<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomSubset<T>(arr: T[], n: number): T[] {
  return arr.sort(() => Math.random() - 0.5).slice(0, n);
}

async function seed() {
  await connectDatabase(process.env["MONGODB_URI"] ?? env.MONGODB_URI);

  console.log("🌱 Starting seed...");

  // Create hackathon
  let hackathonDoc = await Hackathon.findOne({ slug: "hack4hack-2026" }).lean();
  let hackathonId: mongoose.Types.ObjectId;
  if (!hackathonDoc) {
    const created = await Hackathon.create({
      name:        "Hack4Hack Crew Hiring Challenge 2026",
      slug:        "hack4hack-2026",
      minTeamSize: 2,
      maxTeamSize: 5,
      status:      "open",
    });
    hackathonId = created._id;
    console.log(`✅ Hackathon created: ${hackathonId}`);
  } else {
    hackathonId = hackathonDoc._id;
    console.log(`ℹ️  Hackathon already exists: ${hackathonId}`);
  }

  // Shared password hash for all seed users (do not use in production)
  const sharedHash = await argon2.hash("seed_password_123!");

  // ── Create 10,000 users in batches ────────────────────────────────────────
  const TOTAL_USERS = 10_000;
  const BATCH_SIZE  = 500;
  const userIds: mongoose.Types.ObjectId[] = [];

  console.log(`👥 Seeding ${TOTAL_USERS} users...`);

  for (let batch = 0; batch < TOTAL_USERS / BATCH_SIZE; batch++) {
    const users = Array.from({ length: BATCH_SIZE }, (_, i) => {
      const id = batch * BATCH_SIZE + i;
      return {
        displayName:     `User ${id}`,
        email:           `user${id}@seed.crewforge.dev`,
        passwordHash:    sharedHash,
        skills:          randomSubset(SKILLS, Math.floor(Math.random() * 4) + 1),
        timezone:        randomItem(TIMEZONES),
        experienceLevel: randomItem(EXPERIENCE),
        availability:    Math.floor(Math.random() * 8) + 1,
        bio:             `Seed user #${id}`,
        discoverable:    Math.random() > 0.5,
      };
    });

    try {
      const inserted = await User.insertMany(users, { ordered: false });
      userIds.push(...inserted.map((u) => u._id as mongoose.Types.ObjectId));
    } catch (err: unknown) {
      // Skip duplicate key errors on re-run
      if ((err as { code?: number }).code !== 11000) throw err;
    }

    if ((batch + 1) % 5 === 0) {
      console.log(`  ...${(batch + 1) * BATCH_SIZE} users`);
    }
  }

  // If users already existed, fetch their IDs
  if (userIds.length < 100) {
    const existing = await User.find({ email: /seed\.crewforge\.dev$/ }).select("_id").lean();
    userIds.push(...existing.map((u) => u._id as mongoose.Types.ObjectId));
  }

  console.log(`✅ ${userIds.length} users available`);

  // ── Create 2,000 teams ────────────────────────────────────────────────────
  const TOTAL_TEAMS = 2_000;
  const teamBatchSize = 200;

  console.log(`🏗️  Seeding ${TOTAL_TEAMS} teams...`);

  let usedLeaderIdx = 0;
  const teamIds: mongoose.Types.ObjectId[] = [];

  for (let batch = 0; batch < TOTAL_TEAMS / teamBatchSize; batch++) {
    const teams = Array.from({ length: teamBatchSize }, (_, i) => {
      const leaderId = userIds[usedLeaderIdx++]!;
      const memberCount = Math.floor(Math.random() * 4) + 1;
      const maxMembers  = Math.min(5, memberCount + Math.floor(Math.random() * 3));
      return {
        hackathonId,
        name:              `Team ${batch * teamBatchSize + i} ${Math.random().toString(36).slice(2, 6)}`,
        description:       `Seed team looking for collaborators`,
        leaderId,
        memberCount:       1,  // leader only initially
        maxMembers,
        skillsNeeded:      randomSubset(SKILLS, Math.floor(Math.random() * 3) + 1),
        lookingForMembers: maxMembers > 1,
        version:           1,
      };
    });

    try {
      const inserted = await Team.insertMany(teams, { ordered: false });
      teamIds.push(...inserted.map((t) => t._id as mongoose.Types.ObjectId));
    } catch (err: unknown) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }

    if ((batch + 1) % 2 === 0) {
      console.log(`  ...${(batch + 1) * teamBatchSize} teams`);
    }
  }

  console.log(`✅ ${teamIds.length} teams created`);

  // ── Create leader memberships ─────────────────────────────────────────────
  console.log("👑 Creating leader memberships...");

  const teamDocs = await Team.find({ hackathonId }).lean();
  const membershipDocs = teamDocs.map((team) => ({
    hackathonId,
    teamId:      team._id,
    userId:      team.leaderId,
    role:        "leader" as const,
    joinedAt:    team.createdAt,
  }));

  try {
    await Membership.insertMany(membershipDocs, { ordered: false });
  } catch (err: unknown) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }

  console.log(`✅ Leader memberships created`);

  // ── Verify invariants ─────────────────────────────────────────────────────
  const totalTeams        = await Team.countDocuments({ hackathonId });
  const totalMemberships  = await Membership.countDocuments({ hackathonId });
  const totalUsers        = await User.countDocuments({});

  console.log("\n📊 Seed summary:");
  console.log(`   Users:       ${totalUsers}`);
  console.log(`   Teams:       ${totalTeams}`);
  console.log(`   Memberships: ${totalMemberships}`);
  console.log(`   Hackathon:   ${hackathonId}`);
  console.log("\n✅ Seed complete!");

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
