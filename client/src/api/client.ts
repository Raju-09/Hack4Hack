const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  isStateMutation = false
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  // Automatically attach persistent Idempotency-Key for state-changing requests if not set
  if (isStateMutation && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: "include", // send HttpOnly cookies
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorObj = data.error || {};
    throw new ApiError(
      errorObj.code || "UNKNOWN_ERROR",
      errorObj.message || "An unexpected error occurred",
      response.status,
      errorObj.details
    );
  }

  return data as T;
}

export const api = {
  // Auth
  register: (body: unknown) => request<{ user: import("../types").User }>("/auth/register", { method: "POST", body: JSON.stringify(body) }, true),
  login: (body: unknown) => request<{ user: import("../types").User }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  getMe: () => request<{ user: import("../types").User }>("/me"),
  updateProfile: (body: unknown) => request<{ user: import("../types").User }>("/me", { method: "PATCH", body: JSON.stringify(body) }),
  setDiscoverable: (discoverable: boolean) => request<{ discoverable: boolean }>("/me/discoverable", { method: "PATCH", body: JSON.stringify({ discoverable }) }),

  // Teams
  getTeams: (params: string = "") => request<{ teams: import("../types").Team[]; nextCursor: string | null }>(`/teams${params}`),
  getTeam: (id: string) => request<{ team: import("../types").Team; members: import("../types").TeamMember[] }>(`/teams/${id}`),
  createTeam: (body: unknown) => request<{ team: import("../types").Team }>("/teams", { method: "POST", body: JSON.stringify(body) }, true),
  updateTeam: (id: string, body: unknown) => request<{ team: import("../types").Team }>(`/teams/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  leaveTeam: (id: string, successorId?: string) => request<{ teamDeleted: boolean; newLeaderId?: string }>(`/teams/${id}/leave`, { method: "POST", body: JSON.stringify({ successorId }) }, true),
  removeMember: (teamId: string, userId: string) => request<{ ok: boolean }>(`/teams/${teamId}/members/${userId}`, { method: "DELETE" }),
  getTeamAudit: (teamId: string) => request<{ logs: import("../types").AuditLogItem[] }>(`/teams/${teamId}/audit`),

  // Join Requests
  createJoinRequest: (teamId: string, message: string) => request<{ requestId: string }>(`/teams/${teamId}/join-requests`, { method: "POST", body: JSON.stringify({ message }) }, true),
  getTeamJoinRequests: (teamId: string) => request<{ requests: import("../types").JoinRequest[] }>(`/teams/${teamId}/join-requests`),
  acceptJoinRequest: (requestId: string) => request<{ teamId: string; userId: string }>(`/teams/requests/${requestId}/accept`, { method: "POST" }, true),
  declineJoinRequest: (requestId: string) => request<{ ok: boolean }>(`/teams/requests/${requestId}/decline`, { method: "POST" }),

  // Invites
  createInvite: (teamId: string, expiresInHours = 24, maxUses = 1) => request<{ token: string; expiresAt: string }>(`/teams/${teamId}/invites`, { method: "POST", body: JSON.stringify({ expiresInHours, maxUses }) }, true),
  getInvites: (teamId: string) => request<{ invites: import("../types").Invite[] }>(`/teams/${teamId}/invites`),
  revokeInvite: (teamId: string, inviteId: string) => request<{ ok: boolean }>(`/teams/${teamId}/invites/${inviteId}/revoke`, { method: "PATCH" }),
  redeemInvite: (code: string) => request<{ teamId: string }>(`/invites/redeem/${code}`, { method: "POST" }, true),

  // Discovery
  getMatches: (hackathonId: string, teamId?: string) => request<{ matches: import("../types").MatchRecommendation[] }>(`/discovery/matches?hackathonId=${hackathonId}${teamId ? `&teamId=${teamId}` : ""}`),

  // Admin & Concurrency Verification
  runRaceSimulation: (userCount: number) =>
    request<import("../types").RaceSimulationResult>("/admin/race-simulation", {
      method: "POST",
      body: JSON.stringify({ userCount }),
    }),
};
