# CrewForge — Race-Proof Hackathon Team Formation at Scale
**Hack4Hack Crew Hiring Challenge 2026 — Problem Statement 1 (PS1)**

---

## Overview

CrewForge is a production-minded hackathon team formation platform built for **10,000+ participants**. It solves the critical flaw found in most hackathon applications: **concurrency race conditions, overfilled teams, duplicate memberships, and insecure invite codes.**

Instead of superficial CRUD, CrewForge enforces formal business invariants at both the database level (MongoDB Replica Set transactions + compound unique indexes) and application level (atomic conditional reservations, persistent idempotency keys, and object-level authorization).

---

### Evidence & Verification Matrix

| Area | Verification Scope | Status | Evidence Artifact |
|---|---|---|---|
| **End-to-End HTTP Concurrency** | 50 simultaneous authenticated HTTP accept calls through Express middleware & transactions | **VERIFIED PASS** (1 OK / 49 Conflict) | [`server/tests/concurrency/httpRace.test.ts`](server/tests/concurrency/httpRace.test.ts) |
| **Service-Level Concurrency** | 50 concurrent transactions deciding final open seat | **VERIFIED PASS** (0 overfill, INV-1..4 held) | [`server/tests/concurrency/race.test.ts`](server/tests/concurrency/race.test.ts) |
| **API Integration & Security** | 23 integration tests: Auth, RBAC, IDOR, pagination, double-tap idempotency | **VERIFIED PASS** (23/23 passing) | [`server/tests/api/api.test.ts`](server/tests/api/api.test.ts) |
| **Static Code Quality** | TypeScript `strict: true` and ESLint 9 | **VERIFIED PASS** (0 errors, 0 warnings) | `npm run lint` & `npm run typecheck` |
| **CI Quality Gate** | Automated lint, build, API tests, and replica set race tests | **VERIFIED IN CI** | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| **Local Test Environment** | In-process WiredTiger Replica Set with multi-document ACID transactions | **VERIFIED IN CODE** | [`server/tests/setup.ts`](server/tests/setup.ts) |
| **Multi-Host Failover** | Network partitions, election failovers, multi-region replication lag | *Staging/Cluster Target* | Requires multi-host cloud deployment |

> **Testing Environment Distinction:** All automated test suites execute against an in-process MongoDB WiredTiger replica set (`MongoMemoryReplSet`). This accurately tests multi-document ACID transactions, lock serialization, rollback on conflict, and unique index constraint enforcement without requiring external system dependencies. Distributed multi-node primary elections, replication lag, and network partitions are separate cluster-level infrastructure tests.

---

## Key Differentiators Built-In

1. **Race-Proof Membership Engine:** Conditional atomic capacity reservations prevent TOCTOU race conditions. 50 concurrent requests competing for the last seat result in **exactly 1 acceptance** and **49 clean conflict rejections**.
2. **Explainable Teammate Matching:** Deterministic matching score formula ($Score = 0.50S + 0.30T + 0.20A$) with transparent breakdowns (Skill Synergy, Timezone Alignment, Availability Overlap) and human-readable reasons.
3. **Conflict-Aware UX:** When a team fills up mid-request, users are not greeted with a generic error—they receive a friendly explanation and 2 similar teams looking for their exact skills.
4. **Live Race Condition Simulator:** An interactive in-app diagnostic dashboard where judges and engineers can trigger 50 concurrent requests and view real-time latency, capacity invariants, and transaction logs.
5. **Rock-Solid Security:** 256-bit entropy cryptographic invite tokens (SHA-256 hashed storage), Argon2id passwords, HttpOnly SameSite cookies, IDOR defenses, and strict privacy DTOs.
6. **Real-Time Outbox & SSE:** Transactional Outbox pattern guarantees events are never broadcast for aborted transactions.

---

## System Architecture

```text
React 18 + TS (Vite)
         │
         ▼  (HTTPS REST + SSE)
Express.js API Layer (TypeScript)
 ├── Authentication & RBAC (Argon2id, HttpOnly Cookies)
 ├── Persistent Idempotency Middleware (Unique Keys)
 ├── Zod Runtime Validation & Security Redaction
 └── Transactional Outbox Poller
         │
         ▼  (ACID Transactions, w: "majority")
MongoDB 7.0 Replica Set (rs0)
 ├── Teams (Atomic $expr capacity reservation)
 ├── Memberships (Unique compound index: { hackathonId: 1, userId: 1 })
 ├── JoinRequests (Unique index: { teamId: 1, userId: 1 })
 ├── InviteCodes (SHA-256 hashed token lookup)
 ├── AuditLogs (Immutable append-only ledger)
 └── OutboxEvents (Transactional event publishing)
```

---

## Quickstart

### Prerequisites
- Node.js >= 20.0.0
- MongoDB 7.0+ configured as a Replica Set (or Docker)

### Option A: Running via Docker Compose (Local Development)
This boots up a 3-node MongoDB replica set (`mongo1`, `mongo2`, `mongo3`), initializes `rs0`, and starts both the Express API and React frontend in development mode:

```bash
docker compose up --build
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`
- Health check: `http://localhost:4000/health`

*(Note: `docker-compose.yml` is configured for reproducible local development with live reload. For production environments, configure hardened non-root container images, external secret managers, and TLS reverse proxies).*

### Option B: Local Execution

1. **Install Server Dependencies & Build:**
   ```bash
   cd server
   npm install
   npm run build
   ```

2. **Run Linter & Typecheck:**
   ```bash
   npm run lint
   npm run typecheck
   ```

3. **Sync Database Indexes:**
   ```bash
   npm run db:indexes
   ```

4. **Seed Database (10,000 Users, 2,000 Teams):**
   ```bash
   npm run seed
   ```

5. **Start Backend API:**
   ```bash
   npm run dev
   ```

6. **Start Frontend Client:**
   ```bash
   cd ../client
   npm install
   npm run dev
   ```

---

## Automated Testing & Concurrency Proof

CrewForge comes with 31 automated tests verifying end-to-end HTTP concurrency, database invariants, and API security:

```bash
cd server

# Run all 31 tests (API + Service Concurrency + End-to-End HTTP Concurrency)
npm test

# Run only the End-to-End HTTP 50-VU Concurrency Race Test
npm run test:race:http

# Run only the Service-Level Concurrency Test
npm run test:race:service
```

### 1. End-to-End HTTP Concurrency Test (`tests/concurrency/httpRace.test.ts`)
Exercises the full Express HTTP pipeline under concurrent load:
```text
✓ 50 simultaneous HTTP join-request accepts result in exactly 1 HTTP 200 and 49 HTTP 409s
✓ prevents one user from being accepted into two teams simultaneously over HTTP
✓ handles the reapplication lifecycle: submit -> decline -> reapply -> accept over HTTP
✓ prevents over-redemption when multiple users redeem the final invite use simultaneously

E2E HTTP CONCURRENCY RESULT:
- HTTP 200 OK: 1
- HTTP 409 Conflict: 49 (TEAM_FULL)
- Final Team State: memberCount = 2, actual memberships = 2
- Invariants Verified: INV-1 ✓ INV-2 ✓ INV-3 ✓ INV-4 ✓
```

### 2. Service-Level Concurrency Test (`tests/concurrency/race.test.ts`)
```text
✓ allows exactly 1 user to join when 50 attempt simultaneously (50 concurrent transactions)
✓ prevents duplicate membership even with two different idempotency keys
✓ promotes earliest member when leader leaves with others
✓ deletes team when sole member leaves
```

### 3. API Integration & Security Tests (`tests/api/api.test.ts`)
23 tests covering authentication, RBAC, IDOR defenses, double-tap idempotency, and bounded cursor pagination.

---

## 45-Minute Interview Defense Guide

### Q1: Why did you choose MongoDB over PostgreSQL?
**Answer:**
> "The Hack4Hack challenge organizers explicitly stated MongoDB is their preferred evaluation stack. Rather than using naive MongoDB CRUD, I designed it with distributed systems rigor: using a MongoDB Replica Set to unlock multi-document ACID transactions with `w: majority`. Invariants that relational databases solve with foreign keys are enforced using compound unique indexes (`{ hackathonId: 1, userId: 1 }`) and atomic conditional updates (`$expr: { $lt: ['$memberCount', '$maxMembers'] }`)."

### Q2: Why is a simple count check unsafe under concurrency?
**Answer:**
> "A count check followed by an insertion is a classic Time-of-Check to Time-of-Use (TOCTOU) bug. If 50 requests arrive concurrently when a team has 1 seat remaining, all 50 threads read `count = 1 < 2`, all 50 pass the check, and all 50 insert. The team ends up with 51 members. CrewForge avoids this by executing an atomic reservation directly on the team document inside a transaction: `Team.findOneAndUpdate({ _id, lookingForMembers: true, $expr: { $lt: ['$memberCount', '$maxMembers'] } }, { $inc: { memberCount: 1 } }, { session })`. MongoDB serializes conflicting updates on that document, so exactly one succeeds and the other 49 fail."

### Q3: What happens if membership insertion fails after capacity is incremented?
**Answer:**
> "Both operations reside in the same `withTransaction` boundary. If membership insertion fails (for example, if the user was concurrently added to another team, triggering the unique `{ hackathonId: 1, userId: 1 }` index), the entire transaction aborts. The capacity increment is rolled back automatically by the replica set. `memberCount` never drifts from actual memberships."

### Q4: How does idempotency differ from unique membership constraints?
**Answer:**
> "Idempotency ensures that repeating the *same logical HTTP request* (such as a mobile user double-tapping 'Join' during network latency) executes exactly once and safely returns the original response. Unique database indexes ensure that *different requests* from the same user cannot produce duplicate business states (such as submitting two join requests to two different teams across two browser tabs)."

### Q5: How do you protect invite codes from abuse?
**Answer:**
> "Invite tokens are generated with 256 bits of cryptographic entropy (`crypto.randomBytes(32)`). The raw token is returned to the leader once and never stored in the database or server logs. The database stores only `SHA-256(token)`. When redeemed, expiration and revocation are verified synchronously against server time in the transaction, backed by a dedicated IP/user rate limiter."
