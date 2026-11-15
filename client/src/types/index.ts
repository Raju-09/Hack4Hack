export interface User {
  _id: string;
  displayName: string;
  email?: string;
  skills: string[];
  timezone: string;
  experienceLevel: "beginner" | "intermediate" | "advanced";
  availability: number;
  bio: string;
  discoverable: boolean;
}

export interface Team {
  _id: string;
  hackathonId: string;
  name: string;
  description: string;
  leaderId: string;
  memberCount: number;
  maxMembers: number;
  availableSlots: number;
  skillsNeeded: string[];
  lookingForMembers: boolean;
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  role: "leader" | "member";
  joinedAt: string;
  displayName?: string;
  skills?: string[];
  timezone?: string;
  experienceLevel?: string;
  availability?: number;
  bio?: string;
}

export interface JoinRequest {
  _id: string;
  status: "pending" | "accepted" | "declined" | "conflict" | "cancelled";
  message: string;
  createdAt: string;
  user: {
    _id: string;
    displayName?: string;
    skills?: string[];
    timezone?: string;
    availability?: number;
  };
}

export interface Invite {
  _id: string;
  expiresAt: string;
  revokedAt: string | null;
  maxUses: number;
  useCount: number;
  isValid: boolean;
  createdAt: string;
}

export interface AuditLogItem {
  _id: string;
  actorId: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface MatchRecommendation {
  user: {
    _id: string;
    displayName: string;
    skills: string[];
    timezone: string;
    experienceLevel: string;
    availability: number;
    bio: string;
  };
  score: {
    total: number;
    skillScore: number;
    timezoneScore: number;
    availabilityScore: number;
    matchReasons: string[];
  };
}
