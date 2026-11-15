# CrewForge Security & Privacy Assessment Report

**Standard Baseline:** OWASP Application Security Verification Standard (ASVS) Level 2 & Top 10 API Security Risks.

---

## 1. Threat Mitigation Verification Matrix

| Vulnerability Category | Exploit Scenario | Concrete Defense in Code | Verification Status |
|------------------------|------------------|--------------------------|---------------------|
| **BOLA / IDOR** | Attacker changes `:teamId` in URL to view or mutate another team | Object-level authorization in `server/src/services/teamService.ts` and `membershipService.ts`. Verified inside database transaction. | **VERIFIED** (Test T-23) |
| **Privilege Escalation** | Regular member calls `/requests/:id/accept` to accept a peer | Current `leaderId` checked inside transaction directly against team document. Member gets `403 FORBIDDEN`. | **VERIFIED** (Test T-12) |
| **Invite Brute-Force** | Script scans 6-character invitation combinations | 256-bit entropy (`crypto.randomBytes(32).toString('base64url')`). Only SHA-256 hash stored. Dedicated rate limiter (`inviteLimiter` 20 req / 10 min). | **VERIFIED** (Code audit & Test T-15) |
| **TOCTOU Race Condition** | 50 users click accept / join at the same millisecond for 1 seat | Atomic conditional increment `$expr: { $lt: ['$memberCount', '$maxMembers'] }` with multi-document replica set transaction rollback. | **VERIFIED** (50-VU Race Test) |
| **Double-Tap / Replay** | Clumsy user or slow mobile network fires duplicate POST requests | Persistent `Idempotency-Key` middleware backed by `idempotencyRecords` collection with unique index on `(actorId, operation, key)`. | **VERIFIED** (Test T-11) |
| **Duplicate Membership** | User attempts to join two teams simultaneously in one hackathon | MongoDB unique index on `memberships`: `{ hackathonId: 1, userId: 1 }`. Prevents duplicate business state even across separate transactions. | **VERIFIED** (Test T-13) |
| **Data Leakage (Privacy)** | Public discovery endpoints expose participants' emails or passwords | Explicit DTO projection (`toTeamDTO` and `toPublicUser`). `passwordHash` and `refreshTokenHash` configured with `select: false`. | **VERIFIED** (Test T-01, T-09) |
| **NoSQL Injection** | Attacker injects `{"$gt": ""}` in request body | Strict runtime validation with Zod schemas (`RegisterSchema`, `CreateTeamSchema`). Express json parses types; invalid objects rejected with 400. | **VERIFIED** (Test T-19) |
| **Secret Leakage in Logs** | Logger accidentally records passwords or invite tokens | Recursive log redaction in `server/src/utils/logger.ts` filtering all keys matching `password`, `token`, `cookie`, `secret`, `code`. | **VERIFIED** |

---

## 2. Cryptographic Architecture

1. **Password Hashing:**
   - Algorithm: **Argon2id** (memory cost: 64 MiB, time cost: 3 iterations, parallelism: 1).
   - Resilient against GPU-accelerated dictionary attacks.

2. **Invite Token Storage:**
   - Raw token is 256-bit entropy string (`base64url`).
   - The raw token is returned to the team leader **once** upon creation and never held in server memory or logs.
   - Database stores only `SHA-256(raw_token)`. Database breaches cannot be used to redeem active invites.
