import { describe, it, expect } from "vitest";
import supertest from "supertest";
import { createApp } from "../../src/app.js";

const app = createApp();
const request = supertest(app);

describe("Admin Real Race Simulation Endpoint", () => {
  it("executes a real 10-user race simulation and confirms invariant enforcement", async () => {
    const res = await request
      .post("/api/v1/admin/race-simulation")
      .send({ userCount: 10 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalRequests).toBe(10);
    expect(res.body.seatsAvailable).toBe(1);

    // Exactly 1 winner
    expect(res.body.accepted).toBe(1);
    expect(res.body.conflicts).toBe(9);

    // Real invariants confirmed by live database query
    expect(res.body.invariants.inv1_capacityRespected).toBe(true);
    expect(res.body.invariants.inv2_memberCountMatches).toBe(true);
    expect(res.body.invariants.inv3_singleWinner).toBe(true);
    expect(res.body.invariants.inv4_noDuplicateMembers).toBe(true);
    expect(res.body.invariants.allPassed).toBe(true);

    // Latency stats present
    expect(res.body.stats.p50).toBeGreaterThanOrEqual(0);
    expect(res.body.stats.max).toBeGreaterThanOrEqual(res.body.stats.min);

    // Database snapshot matches
    expect(res.body.databaseSnapshot.finalMemberCount).toBe(2);
    expect(res.body.databaseSnapshot.maxMembers).toBe(2);
    expect(res.body.databaseSnapshot.activeMemberships).toBe(2);
    expect(res.body.databaseSnapshot.acceptedJoinRequests).toBe(1);
  }, 25000);
});
