import { Router, Request, Response, NextFunction } from "express";
import { performance } from "node:perf_hooks";
import argon2 from "argon2";
import {
  User,
  Hackathon,
  Team,
  Membership,
  JoinRequest,
} from "../models/index.js";
import { acceptJoinRequest } from "../services/membershipService.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";

const router = Router();

let cachedSimHash: string | null = null;
async function getSimPasswordHash(): Promise<string> {
  if (!cachedSimHash) {
    cachedSimHash = await argon2.hash("SimPassword123!", { type: argon2.argon2id });
  }
  return cachedSimHash;
}

/**
 * POST /api/v1/admin/race-simulation
 *
 * Runs a REAL in-memory / replica set concurrency test with N simultaneous
 * acceptJoinRequest calls competing for exactly ONE remaining seat on a team.
 *
 * All operations execute real multi-document ACID transactions with $expr atomic
 * increments and unique compound index constraints in MongoDB.
 *
 * Returns actual execution latencies, status codes, and post-run database invariant checks.
 */
router.post(
  "/race-simulation",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = performance.now();
    const rawCount = Number(req.body.userCount || 50);
    // Limit between 2 and 100 for safety and responsiveness
    const userCount = Math.max(2, Math.min(100, isNaN(rawCount) ? 50 : rawCount));

    const simBatchId = `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      const passwordHash = await getSimPasswordHash();

      // 1. Create a dedicated ephemeral Hackathon
      const hackathon = await Hackathon.create({
        name: `Concurrency Lab Hackathon (${simBatchId})`,
        slug: `concurrency-lab-${simBatchId}`,
        minTeamSize: 2,
        maxTeamSize: 2,
        status: "open",
      });

      // 2. Create the Team Leader user and the target Team
      const leader = await User.create({
        email: `leader_${simBatchId}@sim.test`,
        passwordHash,
        displayName: "Sim Leader",
        skills: ["Concurrency", "Transactions"],
        timezone: "UTC",
        bio: "Leader of concurrency test team",
        availability: 4,
      });

      const team = await Team.create({
        hackathonId: hackathon._id,
        name: `Race-Target-${simBatchId.slice(-6)}`,
        description: "Target team for simultaneous join request acceptance",
        leaderId: leader._id,
        memberCount: 1, // Leader is member #1
        maxMembers: 2,  // Exactly 1 seat remaining
        skillsNeeded: ["Distributed Systems", "Testing"],
        lookingForMembers: true,
      });

      // Insert leader's membership
      await Membership.create({
        teamId: team._id,
        userId: leader._id,
        hackathonId: hackathon._id,
        role: "leader",
      });

      // 3. Create N applicant users and their pending JoinRequests in bulk
      const applicantDocs = Array.from({ length: userCount }, (_, i) => ({
        email: `candidate_${i}_${simBatchId}@sim.test`,
        passwordHash,
        displayName: `Applicant #${i + 1}`,
        skills: ["Engineering"],
        timezone: "UTC",
        bio: `Concurrency test candidate ${i + 1}`,
        availability: 4,
      }));

      const createdApplicants = await User.insertMany(applicantDocs);

      const joinRequestDocs = createdApplicants.map((applicant, i) => ({
        teamId: team._id,
        userId: applicant._id,
        hackathonId: hackathon._id,
        status: "pending",
        message: `Simulated applicant #${i + 1} requesting single seat`,
      }));

      const createdJoinRequests = await JoinRequest.insertMany(joinRequestDocs);

      // 4. Fire simultaneous acceptJoinRequest calls competing for the 1 remaining seat
      interface RequestResult {
        requestId: string;
        applicantId: string;
        success: boolean;
        latencyMs: number;
        statusCode: number;
        errorCode?: string;
        errorMessage?: string;
      }

      const promises = createdJoinRequests.map(async (jr): Promise<RequestResult> => {
        const reqStart = performance.now();
        try {
          await acceptJoinRequest({
            requestId: String(jr._id),
            actorId: String(leader._id),
          });
          const latencyMs = Math.round((performance.now() - reqStart) * 100) / 100;
          return {
            requestId: String(jr._id),
            applicantId: String(jr.userId),
            success: true,
            latencyMs,
            statusCode: 200,
          };
        } catch (err: unknown) {
          const latencyMs = Math.round((performance.now() - reqStart) * 100) / 100;
          let statusCode = 500;
          let errorCode = "INTERNAL_ERROR";
          let errorMessage = "Unknown error";

          if (err instanceof AppError) {
            statusCode = err.statusCode;
            errorCode = err.code;
            errorMessage = err.message;
          } else if (err instanceof Error) {
            errorMessage = err.message;
          }

          return {
            requestId: String(jr._id),
            applicantId: String(jr.userId),
            success: false,
            latencyMs,
            statusCode,
            errorCode,
            errorMessage,
          };
        }
      });

      const rawResults = await Promise.all(promises);

      // 5. Query live database post-run state to evaluate invariants directly
      const postTeam = await Team.findById(team._id).lean();
      const actualMemberships = await Membership.countDocuments({ teamId: team._id });
      const acceptedRequests = await JoinRequest.countDocuments({
        teamId: team._id,
        status: "accepted",
      });
      const rejectedRequests = await JoinRequest.countDocuments({
        teamId: team._id,
        status: "rejected",
      });
      const pendingRequests = await JoinRequest.countDocuments({
        teamId: team._id,
        status: "pending",
      });

      // Check for duplicate memberships in this team
      const duplicateMembers = await Membership.aggregate([
        { $match: { teamId: team._id } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ]);

      const acceptedCount = rawResults.filter((r) => r.success).length;
      const conflictsCount = rawResults.filter((r) => !r.success).length;

      // Extract and sort latencies
      const latencies = rawResults.map((r) => r.latencyMs).sort((a, b) => a - b);
      const minLatency = latencies[0] ?? 0;
      const maxLatency = latencies[latencies.length - 1] ?? 0;
      const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
      const p90 = latencies[Math.floor(latencies.length * 0.9)] ?? 0;
      const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
      const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
      const sumLatency = latencies.reduce((acc, curr) => acc + curr, 0);
      const meanLatency = latencies.length > 0 ? Math.round((sumLatency / latencies.length) * 100) / 100 : 0;

      // Invariants check
      const inv1 = postTeam ? postTeam.memberCount <= postTeam.maxMembers : false;
      const inv2 = postTeam ? postTeam.memberCount === actualMemberships : false;
      const inv3 = acceptedCount === 1 && acceptedRequests === 1;
      const inv4 = duplicateMembers.length === 0;
      const allPassed = inv1 && inv2 && inv3 && inv4;

      const totalDurationMs = Math.round((performance.now() - startTime) * 100) / 100;

      logger.info("Real race simulation completed", {
        simBatchId,
        userCount,
        acceptedCount,
        conflictsCount,
        durationMs: totalDurationMs,
        allPassed,
      });

      res.status(200).json({
        success: true,
        batchId: simBatchId,
        totalRequests: userCount,
        seatsAvailable: 1,
        accepted: acceptedCount,
        conflicts: conflictsCount,
        breakdown: {
          accepted200: acceptedCount,
          conflicts409: rawResults.filter((r) => r.statusCode === 409).length,
          otherErrors: rawResults.filter((r) => r.statusCode !== 200 && r.statusCode !== 409).length,
        },
        latencies: latencies.slice(0, 50), // return actual sample latencies
        stats: {
          min: minLatency,
          p50,
          p90,
          p95,
          p99,
          max: maxLatency,
          mean: meanLatency,
        },
        invariants: {
          inv1_capacityRespected: inv1,
          inv2_memberCountMatches: inv2,
          inv3_singleWinner: inv3,
          inv4_noDuplicateMembers: inv4,
          allPassed,
        },
        databaseSnapshot: {
          teamId: String(team._id),
          finalMemberCount: postTeam?.memberCount,
          maxMembers: postTeam?.maxMembers,
          activeMemberships: actualMemberships,
          acceptedJoinRequests: acceptedRequests,
          rejectedJoinRequests: rejectedRequests,
          pendingJoinRequests: pendingRequests,
          duplicateMembershipCount: duplicateMembers.length,
        },
        requestsSample: rawResults.slice(0, 10), // first 10 actual per-request outputs
        executionDurationMs: totalDurationMs,
        executedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
