/**
 * API integration tests — 20+ tests covering happy paths, error cases,
 * authorization, idempotency, and edge cases.
 *
 * Uses supertest against the real Express app connected to a test MongoDB
 * replica set. No mocking of database operations.
 */

import { describe, it, expect } from "vitest";
import supertest from "supertest";
import { createApp } from "../../src/app.js";
import { Hackathon, Membership, JoinRequest } from "../../src/models/index.js";

const app = createApp();
const request = supertest(app);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(suffix: string | number) {
  const email = `test_${suffix}@crewforge.test`;
  const regRes = await request.post("/api/v1/auth/register").send({
    displayName: `Test User ${suffix}`,
    email,
    password:    "password123!",
    skills:      ["react", "typescript"],
    timezone:    "UTC",
    experienceLevel: "intermediate",
    availability: 4,
  });
  expect(regRes.status, `register ${suffix}: ${JSON.stringify(regRes.body)}`).toBe(201);

  const cookies = regRes.headers["set-cookie"] as string[];
  return { userId: regRes.body.user._id as string, cookies };
}

async function createHackathon() {
  return Hackathon.create({
    name:        "Integration Test Hackathon",
    slug:        `ith-${Date.now()}`,
    minTeamSize: 2,
    maxTeamSize: 5,
    status:      "open",
  });
}

// ── Auth tests ────────────────────────────────────────────────────────────────

describe("Auth", () => {
  it("T-01: registers a new user and returns public fields only", async () => {
    const res = await request.post("/api/v1/auth/register").send({
      displayName: "Alice", email: "alice@test.com", password: "password123!",
      skills: ["react"], timezone: "UTC", experienceLevel: "beginner", availability: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.displayName).toBe("Alice");
  });

  it("T-02: rejects duplicate email registration", async () => {
    await request.post("/api/v1/auth/register").send({
      displayName: "Bob", email: "bob@test.com", password: "password123!",
    });
    const res = await request.post("/api/v1/auth/register").send({
      displayName: "Bob2", email: "bob@test.com", password: "password123!",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("T-03: login succeeds with correct credentials", async () => {
    await request.post("/api/v1/auth/register").send({
      displayName: "Carol", email: "carol@test.com", password: "password123!",
    });
    const res = await request.post("/api/v1/auth/login").send({
      email: "carol@test.com", password: "password123!",
    });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("T-04: login rejects wrong password", async () => {
    await request.post("/api/v1/auth/register").send({
      displayName: "Dave", email: "dave@test.com", password: "password123!",
    });
    const res = await request.post("/api/v1/auth/login").send({
      email: "dave@test.com", password: "wrongpassword",
    });
    expect(res.status).toBe(401);
  });

  it("T-05: protected endpoint returns 401 without auth", async () => {
    const res = await request.post("/api/v1/teams").send({ name: "Test" });
    expect(res.status).toBe(401);
  });
});

// ── Team tests ────────────────────────────────────────────────────────────────

describe("Teams", () => {
  it("T-06: creates a team atomically (creator is leader with memberCount=1)", async () => {
    const { userId, cookies } = await registerAndLogin("team_creator");
    const hackathon = await createHackathon();

    const res = await request
      .post("/api/v1/teams")
      .set("Cookie", cookies)
      .send({
        hackathonId: String(hackathon._id),
        name: "Alpha Team",
        description: "Test team",
        maxMembers: 4,
        skillsNeeded: ["backend"],
        lookingForMembers: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.team.memberCount).toBe(1);
    expect(res.body.team.leaderId).toBe(userId);

    // Verify membership exists
    const membership = await Membership.findOne({ userId, teamId: res.body.team._id });
    expect(membership).not.toBeNull();
    expect(membership!.role).toBe("leader");
  });

  it("T-07: prevents creating second team in same hackathon", async () => {
    const { cookies } = await registerAndLogin("two_teams");
    const hackathon = await createHackathon();

    await request.post("/api/v1/teams").set("Cookie", cookies).send({
      hackathonId: String(hackathon._id), name: "First Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });

    const res = await request.post("/api/v1/teams").set("Cookie", cookies).send({
      hackathonId: String(hackathon._id), name: "Second Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_MEMBER");
  });

  it("T-08: pagination returns bounded results", async () => {
    const hackathon = await createHackathon();

    // Seed 5 teams directly
    const leaders = await Promise.all(Array.from({ length: 5 }, (_, i) => registerAndLogin(`page_leader_${i}`)));
    for (const { cookies } of leaders) {
      await request.post("/api/v1/teams").set("Cookie", cookies).send({
        hackathonId: String(hackathon._id), name: `PageTeam ${Math.random()}`,
        description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
      });
    }

    const res = await request.get(`/api/v1/teams?hackathonId=${hackathon._id}&limit=3`);
    expect(res.status).toBe(200);
    expect(res.body.teams.length).toBeLessThanOrEqual(3);
    expect(res.body.nextCursor).toBeDefined();
  });

  it("T-09: team details never expose private fields", async () => {
    const { cookies } = await registerAndLogin("privacy_leader");
    const hackathon = await createHackathon();

    const teamRes = await request.post("/api/v1/teams").set("Cookie", cookies).send({
      hackathonId: String(hackathon._id), name: "Privacy Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });

    const detailRes = await request.get(`/api/v1/teams/${teamRes.body.team._id}`);
    expect(detailRes.status).toBe(200);

    // Check members do not expose private fields
    for (const member of detailRes.body.members) {
      expect(member.email).toBeUndefined();
      expect(member.passwordHash).toBeUndefined();
    }
  });
});

// ── Join request tests ────────────────────────────────────────────────────────

describe("Join Requests", () => {
  it("T-10: creates a join request", async () => {
    const { cookies: leaderCookies } = await registerAndLogin("jr_leader");
    const { cookies: userCookies }   = await registerAndLogin("jr_user");
    const hackathon = await createHackathon();

    const teamRes = await request.post("/api/v1/teams").set("Cookie", leaderCookies).send({
      hackathonId: String(hackathon._id), name: "JR Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });

    const joinRes = await request
      .post(`/api/v1/teams/${teamRes.body.team._id}/join-requests`)
      .set("Cookie", userCookies)
      .set("Idempotency-Key", "test-key-join-1")
      .send({ message: "Please let me join" });

    expect(joinRes.status).toBe(201);
    expect(joinRes.body.requestId).toBeDefined();
  });

  it("T-11: double-tap join request is idempotent", async () => {
    const { cookies: leaderCookies } = await registerAndLogin("idt_leader");
    const { cookies: userCookies }   = await registerAndLogin("idt_user");
    const hackathon = await createHackathon();

    const teamRes = await request.post("/api/v1/teams").set("Cookie", leaderCookies).send({
      hackathonId: String(hackathon._id), name: "Idempotent Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });
    const teamId = teamRes.body.team._id;
    const idkKey = "idempotency-join-double-tap";

    const r1 = await request
      .post(`/api/v1/teams/${teamId}/join-requests`)
      .set("Cookie", userCookies)
      .set("Idempotency-Key", idkKey)
      .send({ message: "" });

    const r2 = await request
      .post(`/api/v1/teams/${teamId}/join-requests`)
      .set("Cookie", userCookies)
      .set("Idempotency-Key", idkKey)
      .send({ message: "" });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);  // cached response

    // Only one request document exists
    const count = await JoinRequest.countDocuments({ teamId });
    expect(count).toBe(1);
  });

  it("T-12: non-leader cannot accept a join request (403)", async () => {
    const { cookies: leaderCookies }                   = await registerAndLogin("auth_leader");
    const { cookies: userCookies }                     = await registerAndLogin("auth_user");
    const { cookies: attackerCookies }                 = await registerAndLogin("auth_attacker");
    const hackathon = await createHackathon();

    const teamRes = await request.post("/api/v1/teams").set("Cookie", leaderCookies).send({
      hackathonId: String(hackathon._id), name: "Auth Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });
    const teamId = teamRes.body.team._id;

    await request.post(`/api/v1/teams/${teamId}/join-requests`)
      .set("Cookie", userCookies).set("Idempotency-Key", "auth-join-1").send({});

    const req = await JoinRequest.findOne({ teamId }).lean();

    // Attacker tries to accept
    const res = await request
      .post(`/api/v1/teams/requests/${req!._id}/accept`)
      .set("Cookie", attackerCookies)
      .set("Idempotency-Key", "auth-accept-1")
      .send({});

    expect(res.status).toBe(403);
  });

  it("T-13: member cannot join two teams in same hackathon", async () => {
    const { cookies: l1Cookies } = await registerAndLogin("two_hack_l1");
    const { cookies: l2Cookies } = await registerAndLogin("two_hack_l2");
    const { cookies: userCookies, userId } = await registerAndLogin("two_hack_user");
    const hackathon = await createHackathon();

    const t1 = await request.post("/api/v1/teams").set("Cookie", l1Cookies).send({
      hackathonId: String(hackathon._id), name: "Hack Team A",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });
    const t2 = await request.post("/api/v1/teams").set("Cookie", l2Cookies).send({
      hackathonId: String(hackathon._id), name: "Hack Team B",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });

    // Join team A
    await request.post(`/api/v1/teams/${t1.body.team._id}/join-requests`)
      .set("Cookie", userCookies).set("Idempotency-Key", "two-join-1").send({});
    const req1 = await JoinRequest.findOne({ teamId: t1.body.team._id, userId }).lean();
    await request.post(`/api/v1/teams/requests/${req1!._id}/accept`)
      .set("Cookie", l1Cookies).set("Idempotency-Key", "two-accept-1").send({});

    // Try to join team B
    const r2 = await request.post(`/api/v1/teams/${t2.body.team._id}/join-requests`)
      .set("Cookie", userCookies).set("Idempotency-Key", "two-join-2").send({});

    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe("ALREADY_MEMBER");
  });
});

// ── Invite tests ──────────────────────────────────────────────────────────────

describe("Invites", () => {
  it("T-14: creates and redeems an invite code successfully", async () => {
    const { cookies: leaderCookies } = await registerAndLogin("inv_leader");
    const { cookies: userCookies }   = await registerAndLogin("inv_user");
    const hackathon = await createHackathon();

    const teamRes = await request.post("/api/v1/teams").set("Cookie", leaderCookies).send({
      hackathonId: String(hackathon._id), name: "Invite Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });
    const teamId = teamRes.body.team._id;

    const invRes = await request.post(`/api/v1/teams/${teamId}/invites`)
      .set("Cookie", leaderCookies)
      .send({ expiresInHours: 24, maxUses: 1 });

    expect(invRes.status).toBe(201);
    const { token } = invRes.body;
    expect(token).toBeDefined();

    const redeemRes = await request.post(`/api/v1/invites/redeem/${token}`)
      .set("Cookie", userCookies)
      .set("Idempotency-Key", "redeem-invite-1")
      .send({});

    expect(redeemRes.status).toBe(200);
    expect(redeemRes.body.teamId).toBe(teamId);

    // memberCount updated
    const teamDetail = await request.get(`/api/v1/teams/${teamId}`);
    expect(teamDetail.body.team.memberCount).toBe(2);
  });

  it("T-15: revoked invite cannot be redeemed", async () => {
    const { cookies: leaderCookies } = await registerAndLogin("rev_leader");
    const { cookies: userCookies }   = await registerAndLogin("rev_user");
    const hackathon = await createHackathon();

    const teamRes = await request.post("/api/v1/teams").set("Cookie", leaderCookies).send({
      hackathonId: String(hackathon._id), name: "Revoke Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });
    const teamId = teamRes.body.team._id;

    const invRes = await request.post(`/api/v1/teams/${teamId}/invites`)
      .set("Cookie", leaderCookies).send({ expiresInHours: 24, maxUses: 5 });
    const { token } = invRes.body;

    // Get invite ID to revoke it
    const listRes = await request.get(`/api/v1/teams/${teamId}/invites`).set("Cookie", leaderCookies);
    const inviteId = listRes.body.invites[0]._id;

    await request.patch(`/api/v1/teams/${teamId}/invites/${inviteId}/revoke`)
      .set("Cookie", leaderCookies);

    const redeemRes = await request.post(`/api/v1/invites/redeem/${token}`)
      .set("Cookie", userCookies).set("Idempotency-Key", "revoked-redeem-1").send({});

    expect(redeemRes.status).toBe(422);
    expect(redeemRes.body.error.code).toBe("INVITE_REVOKED");
  });

  it("T-16: non-leader cannot create invite", async () => {
    const { cookies: leaderCookies } = await registerAndLogin("inv_auth_leader");
    const { cookies: memberCookies } = await registerAndLogin("inv_auth_member");
    const hackathon = await createHackathon();

    const teamRes = await request.post("/api/v1/teams").set("Cookie", leaderCookies).send({
      hackathonId: String(hackathon._id), name: "Inv Auth Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });

    const res = await request.post(`/api/v1/teams/${teamRes.body.team._id}/invites`)
      .set("Cookie", memberCookies).send({ expiresInHours: 24, maxUses: 1 });

    expect(res.status).toBe(403);
  });
});

// ── Leave / remove tests ──────────────────────────────────────────────────────

describe("Leave and Remove", () => {
  it("T-17: member can leave team", async () => {
    const { cookies: leaderCookies }                   = await registerAndLogin("leave_leader2");
    const { cookies: memberCookies, userId: memberId }  = await registerAndLogin("leave_member2");
    const hackathon = await createHackathon();

    const teamRes = await request.post("/api/v1/teams").set("Cookie", leaderCookies).send({
      hackathonId: String(hackathon._id), name: "Leave Test Team",
      description: "", maxMembers: 5, skillsNeeded: [], lookingForMembers: true,
    });
    const teamId = teamRes.body.team._id;

    // Add member via join request
    await request.post(`/api/v1/teams/${teamId}/join-requests`)
      .set("Cookie", memberCookies).set("Idempotency-Key", "leave-join-1").send({});
    const req = await JoinRequest.findOne({ teamId, userId: memberId }).lean();
    await request.post(`/api/v1/teams/requests/${req!._id}/accept`)
      .set("Cookie", leaderCookies).set("Idempotency-Key", "leave-accept-1").send({});

    const leaveRes = await request.post(`/api/v1/teams/${teamId}/leave`)
      .set("Cookie", memberCookies).set("Idempotency-Key", "leave-1").send({});

    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.teamDeleted).toBe(false);

    const detail = await request.get(`/api/v1/teams/${teamId}`);
    expect(detail.body.team.memberCount).toBe(1);
  });

  it("T-18: leader cannot remove themselves via remove-member", async () => {
    const { cookies: leaderCookies, userId: leaderId } = await registerAndLogin("self_remove");
    const hackathon = await createHackathon();

    const teamRes = await request.post("/api/v1/teams").set("Cookie", leaderCookies).send({
      hackathonId: String(hackathon._id), name: "Self Remove Team",
      description: "", maxMembers: 5, skillsNeeded: [], lookingForMembers: true,
    });

    const res = await request
      .delete(`/api/v1/teams/${teamRes.body.team._id}/members/${leaderId}`)
      .set("Cookie", leaderCookies);

    expect(res.status).toBe(403);
  });
});

// ── Input validation tests ────────────────────────────────────────────────────

describe("Input Validation", () => {
  it("T-19: rejects malformed skills array", async () => {
    const { cookies } = await registerAndLogin("val_user");
    const hackathon = await createHackathon();

    const res = await request.post("/api/v1/teams").set("Cookie", cookies).send({
      hackathonId: String(hackathon._id),
      name: "Val Team",
      maxMembers: 4,
      skills: "backend",  // should be array
      skillsNeeded: "backend",  // wrong type
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("T-20: rejects team name that is too long", async () => {
    const { cookies } = await registerAndLogin("longname_user");
    const hackathon = await createHackathon();

    const res = await request.post("/api/v1/teams").set("Cookie", cookies).send({
      hackathonId: String(hackathon._id),
      name:        "A".repeat(100),  // max is 80
      maxMembers:  4,
      skillsNeeded: [],
      lookingForMembers: true,
    });

    expect(res.status).toBe(400);
  });

  it("T-21: error response always has code, message and requestId", async () => {
    const res = await request.post("/api/v1/teams").send({ name: "No Auth" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBeDefined();
    expect(res.body.error.message).toBeDefined();
    expect(res.body.error.requestId).toBeDefined();
  });

  it("T-22: invalid ObjectId in URL returns 400 not 500", async () => {
    const res = await request.get("/api/v1/teams/not_a_valid_id");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
  });
});

// ── IDOR tests ────────────────────────────────────────────────────────────────

describe("IDOR Protection", () => {
  it("T-23: cannot view another team's audit log without being a member", async () => {
    const { cookies: c1 } = await registerAndLogin("idor_l1");
    const { cookies: c2 } = await registerAndLogin("idor_l2");
    const hackathon = await createHackathon();

    const t1 = await request.post("/api/v1/teams").set("Cookie", c1).send({
      hackathonId: String(hackathon._id), name: "IDOR Team",
      description: "", maxMembers: 4, skillsNeeded: [], lookingForMembers: true,
    });

    const res = await request.get(`/api/v1/teams/${t1.body.team._id}/audit`).set("Cookie", c2);
    expect(res.status).toBe(403);
  });
});
