import React, { useState, useEffect } from "react";
import { Team, TeamMember, JoinRequest, Invite, AuditLogItem, User } from "../types";
import {
  Users, Crown, UserMinus, LogOut, Key, Clock, ShieldAlert,
  Check, X, Copy, CheckCheck, Trash2, ArrowRight
} from "lucide-react";
import { api, ApiError } from "../api/client";

interface TeamDashboardProps {
  teamId: string;
  user: User | null;
  onLeaveSuccess: () => void;
  onRefreshBoard: () => void;
}

export const TeamDashboard: React.FC<TeamDashboardProps> = ({
  teamId,
  user,
  onLeaveSuccess,
  onRefreshBoard,
}) => {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<"members" | "requests" | "invites" | "audit">("members");

  // Invite creation state
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [maxUses, setMaxUses] = useState(1);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Leave / Successor modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedSuccessor, setSelectedSuccessor] = useState<string>("");
  const [leaving, setLeaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isLeader = team && user && String(team.leaderId) === String(user._id);

  const loadData = async () => {
    try {
      const res = await api.getTeam(teamId);
      setTeam(res.team);
      setMembers(res.members);

      // If leader, load requests & invites
      if (user && String(res.team.leaderId) === String(user._id)) {
        try {
          const reqRes = await api.getTeamJoinRequests(teamId);
          setJoinRequests(reqRes.requests || []);
        } catch (e) {
          // ignore if non-leader
        }

        try {
          const invRes = await api.getInvites(teamId);
          setInvites(invRes.invites || []);
        } catch (e) {
          // ignore
        }
      }

      // Load audit logs if member
      try {
        const auditRes = await api.getTeamAudit(teamId);
        setAuditLogs(auditRes.logs || []);
      } catch (e) {
        // ignore
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [teamId, user]);

  const handleAcceptRequest = async (requestId: string) => {
    setActionError(null);
    try {
      await api.acceptJoinRequest(requestId);
      await loadData();
      onRefreshBoard();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      }
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setActionError(null);
    try {
      await api.declineJoinRequest(requestId);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      }
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      const res = await api.createInvite(teamId, expiresInHours, maxUses);
      setGeneratedToken(res.token);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      }
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await api.revokeInvite(teamId, inviteId);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      }
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    setActionError(null);
    try {
      await api.removeMember(teamId, targetUserId);
      await loadData();
      onRefreshBoard();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      }
    }
  };

  const handleConfirmLeave = async () => {
    setLeaving(true);
    setActionError(null);
    try {
      await api.leaveTeam(teamId, selectedSuccessor || undefined);
      setShowLeaveModal(false);
      onLeaveSuccess();
      onRefreshBoard();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      }
    } finally {
      setLeaving(false);
    }
  };

  if (loading) {
    return <div className="card" style={{ textAlign: "center", padding: "3rem" }}>Loading team dashboard...</div>;
  }

  if (!team) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--danger)" }}>
        Team not found or has been disbanded.
      </div>
    );
  }

  const otherMembers = members.filter((m) => m.userId !== (user ? String(user._id) : ""));

  return (
    <div>
      {/* Header Card */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <h1 style={{ fontSize: "1.75rem" }}>{team.name}</h1>
              <span className={`badge ${team.maxMembers - team.memberCount > 0 ? "badge-open" : "badge-full"}`}>
                {team.memberCount} / {team.maxMembers} Members
              </span>
              {isLeader && <span className="badge badge-leader">You are Leader</span>}
            </div>
            <p style={{ color: "var(--text-muted)", maxWidth: "700px" }}>
              {team.description || "No description provided."}
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            {user && (
              <button
                className="btn btn-danger"
                style={{ fontSize: "0.85rem" }}
                onClick={() => setShowLeaveModal(true)}
              >
                <LogOut size={14} />
                <span>Leave Team</span>
              </button>
            )}
          </div>
        </div>

        {actionError && (
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "8px", color: "#fca5a5", fontSize: "0.85rem" }}>
            {actionError}
          </div>
        )}
      </div>

      {/* Sub Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
        <button
          className={`btn ${activeSubTab === "members" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("members")}
          style={{ fontSize: "0.85rem" }}
        >
          <Users size={14} />
          <span>Members ({members.length})</span>
        </button>

        {isLeader && (
          <>
            <button
              className={`btn ${activeSubTab === "requests" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveSubTab("requests")}
              style={{ fontSize: "0.85rem" }}
            >
              <Clock size={14} />
              <span>Requests ({joinRequests.filter((r) => r.status === "pending").length})</span>
            </button>

            <button
              className={`btn ${activeSubTab === "invites" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveSubTab("invites")}
              style={{ fontSize: "0.85rem" }}
            >
              <Key size={14} />
              <span>Invitations ({invites.length})</span>
            </button>
          </>
        )}

        <button
          className={`btn ${activeSubTab === "audit" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("audit")}
          style={{ fontSize: "0.85rem" }}
        >
          <ShieldAlert size={14} />
          <span>Audit Log ({auditLogs.length})</span>
        </button>
      </div>

      {/* Tab: Members */}
      {activeSubTab === "members" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          {members.map((member) => (
            <div key={member.userId} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <h4 style={{ fontSize: "1rem", color: "var(--text-heading)" }}>
                    {member.displayName || `Member (${member.userId.slice(-4)})`}
                  </h4>
                  {member.role === "leader" ? (
                    <span className="badge badge-leader">
                      <Crown size={12} /> Leader
                    </span>
                  ) : (
                    <span className="badge badge-skill">Member</span>
                  )}
                </div>

                <div style={{ fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.5rem" }}>
                  {member.timezone || "UTC"} · {member.availability ? `${member.availability}h/day` : "Flexible"}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "1rem" }}>
                  {member.skills && member.skills.map((s) => (
                    <span key={s} className="badge badge-skill" style={{ fontSize: "0.7rem" }}>{s}</span>
                  ))}
                </div>
              </div>

              {isLeader && member.role !== "leader" && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                    onClick={() => handleRemoveMember(member.userId)}
                  >
                    <UserMinus size={12} />
                    <span>Remove</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Join Requests */}
      {activeSubTab === "requests" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {joinRequests.filter((r) => r.status === "pending").map((req) => (
            <div key={req._id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <h4 style={{ color: "var(--text-heading)" }}>{req.user.displayName || "Participant"}</h4>
                  <span className="badge badge-open">Pending</span>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                  "{req.message || "I would love to join your team!"}"
                </p>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  {req.user.skills?.map((s) => (
                    <span key={s} className="badge badge-skill">{s}</span>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: "0.8rem" }}
                  onClick={() => handleDeclineRequest(req._id)}
                >
                  <X size={14} />
                  <span>Decline</span>
                </button>
                <button
                  className="btn btn-success"
                  style={{ fontSize: "0.8rem" }}
                  onClick={() => handleAcceptRequest(req._id)}
                >
                  <Check size={14} />
                  <span>Accept Member</span>
                </button>
              </div>
            </div>
          ))}

          {joinRequests.filter((r) => r.status === "pending").length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-subtle)" }}>
              No pending join requests right now.
            </div>
          )}
        </div>
      )}

      {/* Tab: Invites */}
      {activeSubTab === "invites" && (
        <div>
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Create New Invitation</h3>
            <form onSubmit={handleCreateInvite} style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.35rem" }}>
                  Expires In:
                </label>
                <select
                  className="select"
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value))}
                  style={{ width: "160px" }}
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours (1 day)</option>
                  <option value={72}>72 hours (3 days)</option>
                  <option value={168}>7 days</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.35rem" }}>
                  Max Uses:
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  className="input"
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  style={{ width: "120px" }}
                />
              </div>

              <button type="submit" className="btn btn-primary">
                <Key size={14} />
                <span>Generate Token</span>
              </button>
            </form>

            {/* Generated Raw Token Alert (Shown only once) */}
            {generatedToken && (
              <div style={{ marginTop: "1.25rem", padding: "1rem", background: "rgba(99, 102, 241, 0.15)", border: "1px solid var(--primary)", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-heading)", marginBottom: "0.5rem" }}>
                  ⚡ One-Time Cryptographic Invite Token:
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <div className="code-box" style={{ flex: 1, wordBreak: "break-all" }}>
                    {generatedToken}
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedToken);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                  >
                    {copiedToken ? <CheckCheck size={14} color="var(--success)" /> : <Copy size={14} />}
                    <span>{copiedToken ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginTop: "0.5rem" }}>
                  * This token is hashed (SHA-256) upon storage. It will not be shown again.
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {invites.map((inv) => (
              <div key={inv._id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <span className="code-box" style={{ padding: "0.2rem 0.5rem" }}>
                      ID: {inv._id.slice(-6)}
                    </span>
                    <span className={`badge ${inv.isValid ? "badge-open" : "badge-full"}`}>
                      {inv.revokedAt ? "Revoked" : inv.useCount >= inv.maxUses ? "Exhausted" : "Active"}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-subtle)" }}>
                    Uses: {inv.useCount} / {inv.maxUses} · Expires: {new Date(inv.expiresAt).toLocaleString()}
                  </div>
                </div>

                {inv.isValid && (
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                    onClick={() => handleRevokeInvite(inv._id)}
                  >
                    <Trash2 size={12} />
                    <span>Revoke</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Audit Log */}
      {activeSubTab === "audit" && (
        <div className="card" style={{ padding: "0.5rem" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-subtle)" }}>
                  <th style={{ padding: "0.75rem" }}>Timestamp</th>
                  <th style={{ padding: "0.75rem" }}>Action</th>
                  <th style={{ padding: "0.75rem" }}>Actor</th>
                  <th style={{ padding: "0.75rem" }}>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log._id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <td style={{ padding: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-subtle)", whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <span className="badge badge-skill" style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                      {log.actorId.slice(-6)}
                    </td>
                    <td style={{ padding: "0.75rem", color: "var(--text-subtle)", fontSize: "0.75rem" }}>
                      {JSON.stringify(log.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leave Team / Leadership Handover Modal */}
      {showLeaveModal && (
        <div className="modal-overlay" onClick={() => setShowLeaveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Leave {team.name}</h2>

            {team.memberCount === 1 ? (
              <p style={{ color: "var(--warning)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
                ⚠️ You are the sole member of this team. If you leave, this team will be permanently deleted and all pending requests will be cancelled automatically.
              </p>
            ) : isLeader ? (
              <div>
                <p style={{ color: "var(--text-muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
                  As the leader, leaving will transfer team leadership. You can explicitly designate a successor, or let the platform automatically promote the earliest joined member.
                </p>

                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Choose a successor (optional):
                </label>
                <select
                  className="select"
                  value={selectedSuccessor}
                  onChange={(e) => setSelectedSuccessor(e.target.value)}
                  style={{ marginBottom: "1.5rem" }}
                >
                  <option value="">Auto-promote earliest member</option>
                  {otherMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName || `Member ${m.userId.slice(-6)}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
                Are you sure you want to leave this team? You will be free to join or create another team.
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button className="btn btn-secondary" onClick={() => setShowLeaveModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={leaving} onClick={handleConfirmLeave}>
                <span>{leaving ? "Leaving..." : "Confirm Leave"}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
