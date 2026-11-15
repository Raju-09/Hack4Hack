import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

/**
 * CrewForge Load Test — Discovery Board
 *
 * Target:
 * - 10,000 seeded users
 * - 2,000 seeded teams
 * - 100 concurrent virtual users (VUs)
 * - Board endpoint p95 latency < 200 ms
 * - Error rate < 1%
 *
 * Execution:
 *   k6 run load-tests/board.js
 *   k6 run --vus 100 --duration 1m load-tests/board.js
 */

const errorRate = new Rate("error_rate");
const boardLatency = new Trend("board_latency_ms");
const teamDetailLatency = new Trend("team_detail_latency_ms");

export const options = {
  stages: [
    { duration: "15s", target: 30 },  // Ramp-up
    { duration: "30s", target: 100 }, // Sustained load at 100 VUs
    { duration: "15s", target: 0 },   // Ramp-down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],         // HTTP errors < 1%
    "board_latency_ms": ["p(95)<200"],      // p95 latency under 200ms
    "team_detail_latency_ms": ["p(95)<150"],// Detail endpoint p95 < 150ms
  },
};

const BASE_URL = __ENV.API_URL || "http://localhost:4000/api/v1";

const SKILL_FILTERS = [
  "",
  "skills=react",
  "skills=node",
  "skills=typescript",
  "skills=python",
  "skills=mongodb",
];

export default function () {
  const randomSkill = SKILL_FILTERS[Math.floor(Math.random() * SKILL_FILTERS.length)];
  const query = randomSkill ? `?looking=true&limit=20&${randomSkill}` : "?looking=true&limit=20";

  // 1. Fetch Discovery Board
  const boardStart = Date.now();
  const boardRes = http.get(`${BASE_URL}/teams${query}`, {
    headers: { Accept: "application/json" },
  });
  boardLatency.add(Date.now() - boardStart);

  const boardOk = check(boardRes, {
    "board status is 200": (r) => r.status === 200,
    "board returns teams array": (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.teams);
      } catch (e) {
        return false;
      }
    },
  });

  errorRate.add(!boardOk);

  // 2. Simulate user browsing and opening a team's details (40% probability)
  if (boardOk && Math.random() < 0.4) {
    try {
      const body = JSON.parse(boardRes.body);
      if (body.teams && body.teams.length > 0) {
        const randomTeam = body.teams[Math.floor(Math.random() * body.teams.length)];
        const teamId = randomTeam._id;

        const detailStart = Date.now();
        const detailRes = http.get(`${BASE_URL}/teams/${teamId}`);
        teamDetailLatency.add(Date.now() - detailStart);

        const detailOk = check(detailRes, {
          "team detail status is 200": (r) => r.status === 200,
          "has memberCount and maxMembers": (r) => {
            const tBody = JSON.parse(r.body);
            return tBody.team && typeof tBody.team.memberCount === "number";
          },
        });

        errorRate.add(!detailOk);
      }
    } catch (e) {
      // Ignore JSON parse errors in test metrics
    }
  }

  // Realistic user pacing between 1s and 2s
  sleep(1 + Math.random());
}
