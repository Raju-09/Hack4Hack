/**
 * End-to-End HTTP Concurrency Test Suite
 *
 * Exercises the FULL Express HTTP pipeline under concurrent load:
 * Express Routing -> Middleware (Helmet, CORS, CookieParser, RequestID, Auth, RateLimiter, Idempotency)
 *   -> Controller -> Service Layer -> MongoDB Multi-Document ACID Transactions
 *
 * Verifies:
 * 1. 50 simultaneous HTTP accepts for 1 remaining seat -> exactly 1 HTTP 200, 49 HTTP 409s.
 * 2. Simultaneous join attempts by 1 user to 2 different teams -> exactly 1 succeeds, 1 conflict.
 * 3. Concurrent invite code redemption at last remaining seat -> exactly 1 succeeds.
 * 4. Reapplication lifecycle: submit -> decline -> reapply -> accept.
 * 5. All four data invariants (INV-1 through INV-4) hold without exception under HTTP load.
 */

import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { createApp } from "../../src/app.js";
import {
  User, Hackathon, Team, Membership, JoinRequest,
} from "../../src/models/index.js";
import { env } from "../../src/config/env.js";

const app = createApp();
const request = supertest(app);

let cachedPasswordHash: string;

beforeAll(async () => {
  cachedPasswordHash = await argon2.hash("Password123!", { type: argon2.argon2id });
});

/** Helper to create a user directly and return auth cookie */
async function createAuthUser(emailPrefix: string) {
  const user = await User.create({
    email: `${emailPrefix}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`,
    passwordHash: cachedPasswordHash,
    displayName: emailPrefix,
    skills: ["TypeScript", "MongoDB"],
    timezone: "UTC",
    bio: "Test bio",
    availability: 4,
  });

  const accessToken = jwt.sign(
    { sub: String(user._id), email: user.email, type: "access" },
    env.JWT_SECRET,
    { expiresIn: "15m", issuer: "crewforge", audience: "crewforge-client" }
  );

  return {
    user,
    userId: String(user._id),
    cookie: `access_token=${accessToken}`,
  };
}

describe("End-to-End HTTP Concurrency Race Suite", () => {
  it("50 simultaneous HTTP join-request accepts result in exactly 1 HTTP 200 and 49 HTTP 409s", async () => {
    // 1. Setup Hackathon & Team with capacity = 2 (leader + 1 seat)
    const hackathon = await Hackathon.create({
      name: "HTTP Race Hackathon",
      slug: `http-race-${Date.now()}`,
      minTeamSize: 2,
      maxTeamSize: 2,
      status: "open",
    });

    const leader = await createAuthUser("http_leader");

    // Leader creates team via HTTP API
    const teamRes = await request
      .post("/api/v1/teams")
      .set("Cookie", leader.cookie)
      .send({
        hackathonId: String(hackathon._id),
        name: `HTTP Race Team ${Date.now()}`,
        description: "Racing for 1 seat via HTTP",
        maxMembers: 2,
        skillsNeeded: ["TypeScript"],
        lookingForMembers: true,
      });

    expect(teamRes.status).toBe(201);
    const teamId = teamRes.body.team._id;

    // 2. Prepare 50 distinct applicants
    const applicants = await Promise.all(
      Array.from({ length: 50 }, (_, i) => createAuthUser(`http_app_${i}`))
    );

    // 3. Each applicant submits a join request via HTTP API
    const joinRequestIds: string[] = [];
    for (const applicant of applicants) {
      const joinRes = await request
        .post(`/api/v1/teams/${teamId}/join-requests`)
        .set("Cookie", applicant.cookie)
        .send({ message: "Pick me!" });

      expect(joinRes.status).toBe(201);
      joinRequestIds.push(joinRes.body.requestId);
    }

    expect(joinRequestIds).toHaveLength(50);

    // 4. FIRE 50 SIMULTANEOUS HTTP ACCEPT REQUESTS
    // Each request goes through full Express middleware stack, route handlers,
    // and MongoDB transactions.
    const acceptPromises = joinRequestIds.map((reqId, i) =>
      request
        .post(`/api/v1/teams/requests/${reqId}/accept`)
        .set("Cookie", leader.cookie)
        .set("Idempotency-Key", `race-http-accept-${reqId}-${i}`)
        .send()
    );

    const responses = await Promise.all(acceptPromises);

    // 5. Assert HTTP status distributions
    const okResponses = responses.filter((r) => r.status === 200);
    const conflictResponses = responses.filter((r) => r.status === 409);

    console.log(`\n✅ E2E HTTP Concurrency Result:`);
    console.log(`   - HTTP 200 OK: ${okResponses.length}`);
    console.log(`   - HTTP 409 Conflict: ${conflictResponses.length}`);

    expect(okResponses).toHaveLength(1);
    expect(conflictResponses).toHaveLength(49);

    // Conflict codes must be TEAM_FULL or ALREADY_MEMBER
    for (const res of conflictResponses) {
      expect(["TEAM_FULL", "ALREADY_MEMBER"]).toContain(res.body.error?.code);
    }

    // 6. Assert Strict Database Invariants (INV-1 through INV-4)
    const finalTeam = await Team.findById(teamId).lean();
    expect(finalTeam!.memberCount).toBe(2); // INV-1: bounded capacity

    const totalMemberships = await Membership.countDocuments({ teamId });
    expect(totalMemberships).toBe(2); // INV-2: memberCount equals exact membership count

    const leaderMembership = await Membership.findOne({ teamId, userId: leader.userId }).lean();
    expect(leaderMembership).not.toBeNull(); // INV-3: leader is valid member

    // Check applicant memberships (INV-4: at most 1 per user)
    const acceptedUserId = okResponses[0].body.userId;
    const acceptedUserMembership = await Membership.findOne({ teamId, userId: acceptedUserId }).lean();
    expect(acceptedUserMembership).not.toBeNull();

    const acceptedCount = await JoinRequest.countDocuments({ teamId, status: "accepted" });
    const conflictCount = await JoinRequest.countDocuments({ teamId, status: "conflict" });
    expect(acceptedCount).toBe(1);
    expect(conflictCount).toBe(49);
  }, 60_000);

  it("prevents one user from being accepted into two teams simultaneously over HTTP", async () => {
    const hackathon = await Hackathon.create({
      name: "Double Join Hackathon",
      slug: `double-join-${Date.now()}`,
      minTeamSize: 2,
      maxTeamSize: 5,
      status: "open",
    });

    const user = await createAuthUser("double_join_user");
    const leaderA = await createAuthUser("leader_a");
    const leaderB = await createAuthUser("leader_b");

    const teamARes = await request
      .post("/api/v1/teams")
      .set("Cookie", leaderA.cookie)
      .send({
        hackathonId: String(hackathon._id),
        name: `Team Alpha ${Date.now()}`,
        description: "",
        maxMembers: 3,
        skillsNeeded: [],
        lookingForMembers: true,
      });

    const teamBRes = await request
      .post("/api/v1/teams")
      .set("Cookie", leaderB.cookie)
      .send({
        hackathonId: String(hackathon._id),
        name: `Team Beta ${Date.now()}`,
        description: "",
        maxMembers: 3,
        skillsNeeded: [],
        lookingForMembers: true,
      });

    const teamAId = teamARes.body.team._id;
    const teamBId = teamBRes.body.team._id;

    // User submits join requests to both teams
    const reqARes = await request
      .post(`/api/v1/teams/${teamAId}/join-requests`)
      .set("Cookie", user.cookie)
      .send({ message: "Hello A" });
    const reqBRes = await request
      .post(`/api/v1/teams/${teamBId}/join-requests`)
      .set("Cookie", user.cookie)
      .send({ message: "Hello B" });

    expect(reqARes.status).toBe(201);
    expect(reqBRes.status).toBe(201);

    // Both leaders accept the same user simultaneously via HTTP
    const [resA, resB] = await Promise.all([
      request
        .post(`/api/v1/teams/requests/${reqARes.body.requestId}/accept`)
        .set("Cookie", leaderA.cookie)
        .send(),
      request
        .post(`/api/v1/teams/requests/${reqBRes.body.requestId}/accept`)
        .set("Cookie", leaderB.cookie)
        .send(),
    ]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    // Verify user has exactly 1 membership in the hackathon
    const userMemberships = await Membership.countDocuments({
      hackathonId: hackathon._id,
      userId: user.userId,
    });
    expect(userMemberships).toBe(1);
  }, 30_000);

  it("handles the reapplication lifecycle: submit -> decline -> reapply -> accept over HTTP", async () => {
    const hackathon = await Hackathon.create({
      name: "Reapply Hackathon",
      slug: `reapply-${Date.now()}`,
      minTeamSize: 2,
      maxTeamSize: 4,
      status: "open",
    });

    const leader = await createAuthUser("reapply_leader");
    const applicant = await createAuthUser("reapply_applicant");

    const teamRes = await request
      .post("/api/v1/teams")
      .set("Cookie", leader.cookie)
      .send({
        hackathonId: String(hackathon._id),
        name: `Reapply Team ${Date.now()}`,
        description: "",
        maxMembers: 4,
        skillsNeeded: [],
        lookingForMembers: true,
      });

    const teamId = teamRes.body.team._id;

    // 1. Initial join request
    const join1 = await request
      .post(`/api/v1/teams/${teamId}/join-requests`)
      .set("Cookie", applicant.cookie)
      .send({ message: "First try" });
    expect(join1.status).toBe(201);
    const reqId = join1.body.requestId;

    // 2. Leader declines request
    const declineRes = await request
      .post(`/api/v1/teams/requests/${reqId}/decline`)
      .set("Cookie", leader.cookie)
      .send();
    expect(declineRes.status).toBe(200);

    const declinedDoc = await JoinRequest.findById(reqId).lean();
    expect(declinedDoc!.status).toBe("declined");

    // 3. User re-applies with updated message
    const join2 = await request
      .post(`/api/v1/teams/${teamId}/join-requests`)
      .set("Cookie", applicant.cookie)
      .send({ message: "Improved application with new portfolio" });
    expect(join2.status).toBe(201);

    const reapplyDoc = await JoinRequest.findById(reqId).lean();
    expect(reapplyDoc!.status).toBe("pending");
    expect(reapplyDoc!.message).toBe("Improved application with new portfolio");

    // 4. Leader accepts the re-application
    const acceptRes = await request
      .post(`/api/v1/teams/requests/${reqId}/accept`)
      .set("Cookie", leader.cookie)
      .send();
    expect(acceptRes.status).toBe(200);

    const finalDoc = await JoinRequest.findById(reqId).lean();
    expect(finalDoc!.status).toBe("accepted");
  });

  it("prevents over-redemption when multiple users redeem the final invite use simultaneously", async () => {
    const hackathon = await Hackathon.create({
      name: "Invite Race Hackathon",
      slug: `invite-race-${Date.now()}`,
      minTeamSize: 2,
      maxTeamSize: 2, // Only 1 seat left
      status: "open",
    });

    const leader = await createAuthUser("invite_race_leader");

    const teamRes = await request
      .post("/api/v1/teams")
      .set("Cookie", leader.cookie)
      .send({
        hackathonId: String(hackathon._id),
        name: `Invite Race Team ${Date.now()}`,
        description: "",
        maxMembers: 2,
        skillsNeeded: [],
        lookingForMembers: true,
      });

    const teamId = teamRes.body.team._id;

    // Create an invite with maxUses = 5, but team only has 1 seat available
    const inviteRes = await request
      .post(`/api/v1/teams/${teamId}/invites`)
      .set("Cookie", leader.cookie)
      .send({ maxUses: 5, expiresInHours: 24 });

    expect(inviteRes.status).toBe(201);
    const code = inviteRes.body.token;

    // 10 concurrent applicants try to redeem simultaneously
    const applicants = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createAuthUser(`invite_racer_${i}`))
    );

    const redeemResults = await Promise.all(
      applicants.map((appUser) =>
        request
          .post(`/api/v1/invites/redeem/${code}`)
          .set("Cookie", appUser.cookie)
          .send()
      )
    );

    const okRedeems = redeemResults.filter((r) => r.status === 200);
    const conflictRedeems = redeemResults.filter((r) => r.status === 409);

    expect(okRedeems).toHaveLength(1);
    expect(conflictRedeems).toHaveLength(9);

    // Verify team member count never exceeded maxMembers
    const teamDoc = await Team.findById(teamId).lean();
    expect(teamDoc!.memberCount).toBe(2);

    const memberships = await Membership.countDocuments({ teamId });
    expect(memberships).toBe(2);
  }, 30_000);
});
