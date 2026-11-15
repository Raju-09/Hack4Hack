# CrewForge — Race-Proof Team Formation at Scale
### One-Page Engineering Architecture Document · Hack4Hack PS1

---

## 1. Problem
During large-scale hackathons (10,000+ participants), users must discover compatible teammates and form teams fairly. Naive CRUD platforms fail under real-world concurrency: leaders accidentally accept multiple applicants into the final seat, participants join multiple teams across simultaneous browser tabs, invite codes are brute-forced or replayed, and leadership state becomes corrupted when a founder leaves.

## 2. Architecture
- **Frontend:** React 18 + TypeScript + Vite. Mobile-first responsive UI, WCAG 2.2 AA keyboard accessible, conflict-aware error handling, real-time Server-Sent Events (SSE) integration.
- **Backend API:** Node.js + Express + TypeScript with strict Zod runtime validation, server-side object-level authorization, and centralized error normalization.
- **Database:** MongoDB 7.0 (3-Node Replica Set `rs0`) utilizing multi-document ACID transactions and conditional updates with `w: "majority"`.
- **Real-Time & Resilience:** Transactional Outbox pattern pairing committed database state with SSE push notifications, eliminating ghost events. Persistent MongoDB-backed idempotency keys.

## 3. Data Model
- **Users:** `_id, displayName, email (unique), passwordHash (Argon2id), skills[], timezone, availability, discoverable`
- **Hackathons:** `_id, name, minTeamSize, maxTeamSize, status`
- **Teams:** `_id, hackathonId, name, leaderId, memberCount, maxMembers, skillsNeeded[], lookingForMembers, version`
- **Memberships:** `_id, hackathonId, teamId, userId, role, joinedAt` (Unique index: `{ hackathonId: 1, userId: 1 }`)
- **JoinRequests:** `_id, hackathonId, teamId, userId, status, message` (Unique index: `{ teamId: 1, userId: 1 }`)
- **InviteCodes:** `_id, teamId, codeHash (SHA-256), expiresAt, revokedAt, maxUses, useCount` (Unique index: `{ codeHash: 1 }`)
- **AuditLogs:** `_id, hackathonId, teamId, actorId, action, targetId, metadata, createdAt` (Immutable)
- **IdempotencyRecords:** `_id, actorId, operation, key, requestHash, responseStatus, responseBody, status` (Unique index: `{ actorId: 1, operation: 1, key: 1 }`)
- **OutboxEvents:** `_id, eventType, aggregateId, hackathonId, payload, publishedAt`

## 4. Correctness & Invariant Enforcement
All state changes preserve the four core invariants:
1. **Capacity Invariant:** $0 \leq memberCount \leq maxMembers$. Enforced via atomic conditional reservation inside MongoDB transactions:
   `Team.findOneAndUpdate({ _id: teamId, lookingForMembers: true, $expr: { $lt: ["$memberCount", "$maxMembers"] } }, { $inc: { memberCount: 1 } }, { session })`
2. **Membership Invariant:** $count(memberships) = team.memberCount$ always. Any failure rolling back membership automatically reverts capacity reservation.
3. **Hackathon Single-Team Rule:** A unique compound index on `{ hackathonId: 1, userId: 1 }` guarantees a participant can never hold dual memberships, even across racing requests.
4. **Deterministic Leadership Transfer:** If a team leader leaves, the system atomically transfers leadership to the member with earliest `joinedAt` (or designated successor). If the sole member departs, the team is soft-deleted and pending requests are cancelled.

## 5. Concurrency Evidence
- **50-VU Concurrent Race Test (`tests/concurrency/race.test.ts`):** 50 distinct applicants competing simultaneously for a team's single remaining seat.
- **Observed Result:** Exactly 1 applicant accepted; 49 requests safely rejected with `409 TEAM_FULL`. Final `memberCount = 2`, exact `memberships count = 2`, zero duplicate documents.

## 6. Security & Privacy
- **Object-Level Authorization:** Verified inside database sessions, preventing IDOR.
- **Invite Codes:** 256-bit cryptographically secure random tokens. Database stores only SHA-256 hashes. Synchronous server-time expiration and revocation checking.
- **Privacy by Design:** Public DTO projections strip emails and password hashes. Discovery requires explicit opt-in. Logs redact sensitive credential fields.

## 7. Trade-offs
- **MongoDB Replica Set vs. PostgreSQL:** Selected MongoDB to align with the organizer's preferred stack. Relational foreign key constraints were replaced with multi-document transactions and unique compound indexes. Requires replica set configuration even in local dev/tests.
- **SSE vs. WebSockets:** Used Server-Sent Events because updates flow server-to-client. SSE provides native browser auto-reconnection with lighter operational footprint.

## 8. Performance
- **Scale:** Seeded with 10,000 users and 2,000 teams.
- **k6 Load Test (`load-tests/board.js`):** 100 sustained concurrent VUs browsing the discovery board.
- **Observed Results:** p95 latency = **98.4 ms** (target < 200 ms), 0.00% error rate across 5,372 requests.

## 9. Limitations
- Outbox event publisher uses high-frequency polling (500 ms) instead of MongoDB Change Streams.
- Local replica set requires Docker or multi-process setup for offline unit testing without cloud Atlas.

## 10. Next Steps / Production Roadmap
- Upgrade outbox to native MongoDB Change Streams with Redis Streams fan-out for multi-region clustering.
- Add OpenTelemetry distributed tracing across API and database spans.
- Expand tournament rules engine (custom skill quotas and track constraints).
