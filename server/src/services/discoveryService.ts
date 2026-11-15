import { User, Membership, Team } from "../models/index.js";
import { NotFoundError } from "../utils/errors.js";

/**
 * US-09: Explainable teammate matching.
 *
 * Score = 0.50 * S_skill + 0.30 * S_tz + 0.20 * S_avail
 *
 * All factors normalised to [0, 1]. Each score component is returned
 * alongside the total so the UI can explain why a candidate ranked high.
 *
 * This is deterministic scoring — not AI. Never label it "AI-powered".
 */

interface MatchScore {
  total: number;
  skillScore: number;
  timezoneScore: number;
  availabilityScore: number;
  matchReasons: string[];
}

function computeSkillScore(
  neededSkills: string[],
  existingSkills: string[],   // skills already on team
  candidateSkills: string[]
): number {
  if (neededSkills.length === 0) return 1;
  const normalizedNeeded = neededSkills.map((s) => s.toLowerCase());
  const normalizedExisting = new Set(existingSkills.map((s) => s.toLowerCase()));
  const normalizedCandidate = new Set(candidateSkills.map((s) => s.toLowerCase()));

  // Count skills needed that the candidate has AND existing team doesn't
  let complementaryMatches = 0;
  for (const needed of normalizedNeeded) {
    if (normalizedCandidate.has(needed) && !normalizedExisting.has(needed)) {
      complementaryMatches++;
    }
  }
  return complementaryMatches / normalizedNeeded.length;
}

function computeTimezoneScore(teamTimezones: string[], candidateTz: string): number {
  if (teamTimezones.length === 0) return 1;

  // Parse UTC offset from IANA timezone label (approximate approach)
  // A proper implementation would use the Intl API
  function parseOffset(tz: string): number {
    try {
      const now = new Date();
      const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
      const tzStr  = now.toLocaleString("en-US", { timeZone: tz });
      return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3_600_000;
    } catch {
      return 0;
    }
  }

  const candidateOffset = parseOffset(candidateTz);
  const avgTeamOffset = teamTimezones
    .map(parseOffset)
    .reduce((a, b) => a + b, 0) / teamTimezones.length;

  const hourDiff = Math.abs(candidateOffset - avgTeamOffset);
  // 0h diff = 1.0, 6h diff = 0.5, 12h diff = 0.0
  return Math.max(0, 1 - hourDiff / 12);
}

function computeAvailabilityScore(
  teamAvailability: number[],  // hours/day per existing member
  candidateAvailability: number
): number {
  if (teamAvailability.length === 0) return 1;
  const avgTeam = teamAvailability.reduce((a, b) => a + b, 0) / teamAvailability.length;
  // Perfect if within 2 hours; zero if more than 8 hours apart
  const diff = Math.abs(avgTeam - candidateAvailability);
  return Math.max(0, 1 - diff / 8);
}

function buildReasons(scores: Omit<MatchScore, "total" | "matchReasons">, candidate: {
  skills: string[];
  timezone: string;
  availability: number;
}): string[] {
  const reasons: string[] = [];
  if (scores.skillScore >= 0.75) reasons.push(`Strong skill match (${candidate.skills.slice(0, 3).join(", ")})`);
  else if (scores.skillScore >= 0.4) reasons.push("Partial skill match");
  if (scores.timezoneScore >= 0.8) reasons.push("Compatible timezone");
  else if (scores.timezoneScore < 0.4) reasons.push("Significant timezone difference");
  if (scores.availabilityScore >= 0.75) reasons.push(`Good availability overlap (${candidate.availability}h/day)`);
  return reasons;
}

export async function getDiscoveryMatches(input: {
  hackathonId: string;
  teamId?: string;
  requestingUserId: string;
  limit: number;
}): Promise<Array<{
  user: {
    _id: string;
    displayName: string;
    skills: string[];
    timezone: string;
    experienceLevel: string;
    availability: number;
    bio: string;
  };
  score: MatchScore;
}>> {
  // Find users with discoverable = true who are NOT yet in a team this hackathon
  const memberUserIds = await Membership.distinct("userId", {
    hackathonId: input.hackathonId,
  });

  const candidates = await User.find({
    discoverable: true,
    deletedAt:    null,
    _id:          { $nin: [input.requestingUserId, ...memberUserIds] },
  })
    .select("-passwordHash -refreshTokenHash -email")
    .limit(200)
    .lean();

  // Determine team context for scoring
  let neededSkills: string[] = [];
  let teamMemberSkills: string[] = [];
  let teamMemberTimezones: string[] = [];
  let teamMemberAvailability: number[] = [];

  if (input.teamId) {
    const team = await Team.findOne({ _id: input.teamId, deletedAt: null }).lean();
    if (team) {
      neededSkills = team.skillsNeeded;
      const memberships = await Membership.find({ teamId: input.teamId })
        .populate("userId", "skills timezone availability")
        .lean();
      for (const m of memberships) {
        const u = m.userId as unknown as Record<string, unknown> | null;
        if (u && typeof u === "object") {
          teamMemberSkills.push(...((u["skills"] as string[]) ?? []));
          if (u["timezone"]) teamMemberTimezones.push(u["timezone"] as string);
          if (u["availability"] !== undefined) teamMemberAvailability.push(u["availability"] as number);
        }
      }
    }
  }

  // Score each candidate
  const scored = candidates.map((candidate) => {
    const skillScore        = computeSkillScore(neededSkills, teamMemberSkills, candidate.skills);
    const timezoneScore     = computeTimezoneScore(teamMemberTimezones, candidate.timezone);
    const availabilityScore = computeAvailabilityScore(teamMemberAvailability, candidate.availability);

    const total = 0.50 * skillScore + 0.30 * timezoneScore + 0.20 * availabilityScore;
    const matchReasons = buildReasons({ skillScore, timezoneScore, availabilityScore }, candidate);

    return {
      user: {
        _id:             String(candidate._id),
        displayName:     candidate.displayName,
        skills:          candidate.skills,
        timezone:        candidate.timezone,
        experienceLevel: candidate.experienceLevel,
        availability:    candidate.availability,
        bio:             candidate.bio,
      },
      score: { total, skillScore, timezoneScore, availabilityScore, matchReasons },
    };
  });

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score.total - a.score.total);
  return scored.slice(0, input.limit);
}
