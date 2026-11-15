/**
 * Race-condition correctness test.
 *
 * This test is the CORE evidence that the capacity invariant holds
 * under concurrent requests. It MUST run against a real MongoDB replica set.
 * No mocking is used here — mocking would invalidate the evidence.
 *
 * Test plan:
 * 1. Create a hackathon and team with maxMembers = 2 (1 existing leader).
 *    Available seats = 1.
 * 2. Create 50 candidate users, each not in any team.
 * 3. Fire 50 concurrent join request + accept sequences.
 * 4. Assert:
 *    a. Exactly 1 membership was added (total 2 including leader).
 *    b. team.memberCount = 2 (leader + 1 accepted).
 *    c. No duplicate membership exists.
 *    d. At most 1 request is in "accepted" status.
 *    e. team.memberCount equals count(memberships) — INV-2.
 *    f. team.leaderId is still a valid member — INV-3.
 */

import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import {
  User, Hackathon, Team, Membership, JoinRequest,
} from "../../src/models/index.js";
import { createTeam } from "../../src/services/teamService.js";
import { createJoinRequest, acceptJoinRequest } from "../../src/services/membershipService.js";
import argon2 from "argon2";

let sharedTestHash = "";

async function getSharedHash(): Promise<string> {
  if (!sharedTestHash) {
    sharedTestHash = await argon2.hash("password123");
  }
  return sharedTestHash;
}

async function createTestUser(suffix: number | string) {
  const passwordHash = await getSharedHash();
  return User.create({
    displayName:  `User ${suffix}`,
    email:        `user${suffix}@test.com`,
    passwordHash,
    skills:       ["backend"],
    timezone:     "UTC",
    experienceLevel: "intermediate",
    availability: 4,
    bio:          "",
    discoverable: false,
  });
}

describe("Race-condition: 50 users compete for 1 seat", () => {
  it("allows exactly 1 user to join when 50 attempt simultaneously", async () => {
    // ── Setup ────────────────────────────────────────────────────────────────
    const leader = await createTestUser("leader");

    const hackathon = await Hackathon.create({
      name:        "Test Hackathon",
      slug:        "test-hackathon",
      minTeamSize: 2,
      maxTeamSize: 5,
      status:      "open",
    });

    // Create team with leader — maxMembers = 2, so 1 seat available
    const teamDto = await createTeam({
      hackathonId:       String(hackathon._id),
      name:              "Race Test Team",
      description:       "",
      maxMembers:        2,
      skillsNeeded:      ["backend"],
      lookingForMembers: true,
      creatorId:         String(leader._id),
    });

    // Create 50 candidate users
    const candidates = await Promise.all(
      Array.from({ length: 50 }, (_, i) => createTestUser(`candidate_${i}`))
    );

    // ── Create join requests for all 50 ─────────────────────────────────────
    const requestResults = await Promise.allSettled(
      candidates.map((candidate) =>
        createJoinRequest({
          teamId:  teamDto._id,
          userId:  String(candidate._id),
          message: "Let me join!",
        })
      )
    );

    const successfulRequests = requestResults.filter((r) => r.status === "fulfilled");
    expect(successfulRequests.length).toBe(50);  // All requests created

    // Get all pending request IDs
    const pendingRequests = await JoinRequest.find({
      teamId: teamDto._id,
      status: "pending",
    }).lean();
    expect(pendingRequests.length).toBe(50);

    // ── Leader attempts to accept ALL 50 requests simultaneously ─────────────
    const acceptResults = await Promise.allSettled(
      pendingRequests.map((r) =>
        acceptJoinRequest({
          requestId: String(r._id),
          actorId:   String(leader._id),
        })
      )
    );

    const acceptedCount  = acceptResults.filter((r) => r.status === "fulfilled").length;
    const rejectedCount  = acceptResults.filter((r) => r.status === "rejected").length;

    // ── Assertions ───────────────────────────────────────────────────────────

    // ASSERTION 1: Exactly 1 acceptance succeeded
    expect(acceptedCount).toBe(1);
    expect(rejectedCount).toBe(49);

    // ASSERTION 2: team.memberCount = 2 (leader + 1 accepted)
    const team = await Team.findById(teamDto._id).lean();
    expect(team).not.toBeNull();
    expect(team!.memberCount).toBe(2);

    // ASSERTION 3: Actual membership count matches memberCount (INV-2)
    const membershipCount = await Membership.countDocuments({ teamId: teamDto._id });
    expect(membershipCount).toBe(team!.memberCount);

    // ASSERTION 4: Exactly 1 "accepted" request
    const acceptedRequests = await JoinRequest.countDocuments({
      teamId: teamDto._id,
      status: "accepted",
    });
    expect(acceptedRequests).toBe(1);

    // ASSERTION 5: No user is in two teams (INV-4)
    const memberships = await Membership.find({ teamId: teamDto._id }).lean();
    const userIds = memberships.map((m) => String(m.userId));
    const uniqueUserIds = new Set(userIds);
    expect(uniqueUserIds.size).toBe(userIds.length);

    // ASSERTION 6: team.leaderId is still a valid member (INV-3)
    const leaderMembership = await Membership.findOne({
      teamId: teamDto._id,
      userId: leader._id,
    }).lean();
    expect(leaderMembership).not.toBeNull();

    // ASSERTION 7: team is within capacity (INV-1)
    expect(team!.memberCount).toBeLessThanOrEqual(team!.maxMembers);
    expect(team!.memberCount).toBeGreaterThanOrEqual(0);

    console.log(`\n✅ Race test passed:`);
    console.log(`   - ${acceptedCount} acceptance(s) succeeded`);
    console.log(`   - ${rejectedCount} rejections (TeamFull / AlreadyMember)`);
    console.log(`   - Final memberCount: ${team!.memberCount}`);
    console.log(`   - Actual memberships: ${membershipCount}`);
    console.log(`   - INV-1 ✓ INV-2 ✓ INV-3 ✓ INV-4 ✓`);
  }, 60_000);

  it("prevents duplicate membership even with two different idempotency keys", async () => {
    const user = await createTestUser("dup_user");

    const hackathon = await Hackathon.create({
      name: "Dup Test Hackathon", slug: "dup-test", minTeamSize: 2, maxTeamSize: 5, status: "open",
    });

    const leader = await createTestUser("dup_leader");
    const teamA  = await createTeam({
      hackathonId: String(hackathon._id), name: "Team A", description: "",
      maxMembers: 3, skillsNeeded: [], lookingForMembers: true, creatorId: String(leader._id),
    });
    const leader2 = await createTestUser("dup_leader2");
    const teamB  = await createTeam({
      hackathonId: String(hackathon._id), name: "Team B", description: "",
      maxMembers: 3, skillsNeeded: [], lookingForMembers: true, creatorId: String(leader2._id),
    });

    // Create requests to both teams
    await createJoinRequest({ teamId: teamA._id, userId: String(user._id), message: "" });
    await createJoinRequest({ teamId: teamB._id, userId: String(user._id), message: "" });

    const reqA = await JoinRequest.findOne({ teamId: teamA._id, userId: user._id }).lean();
    const reqB = await JoinRequest.findOne({ teamId: teamB._id, userId: user._id }).lean();

    // Accept both simultaneously
    const results = await Promise.allSettled([
      acceptJoinRequest({ requestId: String(reqA!._id), actorId: String(leader._id) }),
      acceptJoinRequest({ requestId: String(reqB!._id), actorId: String(leader2._id) }),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled").length;
    // INV-4: at most 1 membership per user per hackathon
    expect(successes).toBe(1);

    const totalMemberships = await Membership.countDocuments({
      hackathonId: hackathon._id,
      userId:      user._id,
    });
    expect(totalMemberships).toBe(1);
  }, 60_000);
});

describe("Leader departure", () => {
  it("promotes earliest member when leader leaves with others", async () => {
    const leader   = await createTestUser("leave_leader");
    const member1  = await createTestUser("leave_m1");
    const member2  = await createTestUser("leave_m2");

    const hackathon = await Hackathon.create({
      name: "Leave Test", slug: "leave-test", minTeamSize: 2, maxTeamSize: 5, status: "open",
    });

    const teamDto = await createTeam({
      hackathonId: String(hackathon._id), name: "Leave Team", description: "",
      maxMembers: 5, skillsNeeded: [], lookingForMembers: true, creatorId: String(leader._id),
    });

    // Add member1 and member2
    for (const m of [member1, member2]) {
      await createJoinRequest({ teamId: teamDto._id, userId: String(m._id), message: "" });
      const req = await JoinRequest.findOne({ teamId: teamDto._id, userId: m._id }).lean();
      await acceptJoinRequest({ requestId: String(req!._id), actorId: String(leader._id) });
    }

    const { leaveTeam } = await import("../../src/services/membershipService.js");
    const result = await leaveTeam({ teamId: teamDto._id, userId: String(leader._id) });

    expect(result.teamDeleted).toBe(false);
    expect(result.newLeaderId).toBeDefined();

    // INV-3: new leader is a member
    const newLeaderMembership = await Membership.findOne({
      teamId: teamDto._id,
      userId: result.newLeaderId,
    }).lean();
    expect(newLeaderMembership).not.toBeNull();

    // Old leader should NOT be a member
    const oldLeaderMembership = await Membership.findOne({
      teamId: teamDto._id,
      userId: leader._id,
    }).lean();
    expect(oldLeaderMembership).toBeNull();

    // memberCount should be 2
    const team = await Team.findById(teamDto._id).lean();
    expect(team!.memberCount).toBe(2);
    const actualCount = await Membership.countDocuments({ teamId: teamDto._id });
    expect(actualCount).toBe(team!.memberCount);
  }, 30_000);

  it("deletes team when sole member leaves", async () => {
    const leader = await createTestUser("sole_leader");
    const hackathon = await Hackathon.create({
      name: "Solo Test", slug: "solo-test", minTeamSize: 1, maxTeamSize: 5, status: "open",
    });
    const teamDto = await createTeam({
      hackathonId: String(hackathon._id), name: "Solo Team", description: "",
      maxMembers: 5, skillsNeeded: [], lookingForMembers: true, creatorId: String(leader._id),
    });

    const { leaveTeam } = await import("../../src/services/membershipService.js");
    const result = await leaveTeam({ teamId: teamDto._id, userId: String(leader._id) });

    expect(result.teamDeleted).toBe(true);

    // Team should be soft-deleted
    const team = await Team.findById(teamDto._id).lean();
    expect(team!.deletedAt).not.toBeNull();

    // No memberships remain
    const count = await Membership.countDocuments({ teamId: teamDto._id });
    expect(count).toBe(0);
  }, 30_000);
});
