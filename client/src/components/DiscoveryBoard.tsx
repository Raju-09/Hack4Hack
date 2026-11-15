import React, { useState } from "react";
import { Team, User } from "../types";
import { Search, Plus, Key, UserCheck, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { api, ApiError } from "../api/client";

interface DiscoveryBoardProps {
  teams: Team[];
  user: User | null;
  onSelectTeam: (teamId: string) => void;
  onCreateTeamClick: () => void;
  onRefresh: () => void;
  onOpenAuth: () => void;
}

export const DiscoveryBoard: React.FC<DiscoveryBoardProps> = ({
  teams,
  user,
  onSelectTeam,
  onCreateTeamClick,
  onRefresh,
  onOpenAuth,
}) => {
  const [search, setSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Join request modal state
  const [requestModalTeam, setRequestModalTeam] = useState<Team | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState<{ code: string; message: string } | null>(null);
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Extract unique skills
  const allSkills = Array.from(new Set(teams.flatMap((t) => t.skillsNeeded || []))).slice(0, 10);

  const filteredTeams = teams.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.skillsNeeded.some((s) => s.toLowerCase().includes(search.toLowerCase()));

    const matchesSkill = !selectedSkill || t.skillsNeeded.includes(selectedSkill);
    return matchesSearch && matchesSkill;
  });

  const handleRedeemInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    if (!user) {
      onOpenAuth();
      return;
    }

    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const res = await api.redeemInvite(inviteCode.trim());
      setInviteSuccess(`Successfully joined team!`);
      setInviteCode("");
      onRefresh();
      onSelectTeam(res.teamId);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setInviteError(err.message);
      } else {
        setInviteError("Failed to redeem invitation");
      }
    } finally {
      setInviteLoading(false);
    }
  };

  const handleSendJoinRequest = async () => {
    if (!requestModalTeam) return;
    if (!user) {
      onOpenAuth();
      return;
    }

    setSubmittingRequest(true);
    setRequestError(null);

    try {
      await api.createJoinRequest(requestModalTeam._id, requestMessage);
      setRequestSuccess(true);
      setTimeout(() => {
        setRequestModalTeam(null);
        setRequestSuccess(false);
        setRequestMessage("");
        onRefresh();
      }, 1500);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setRequestError({ code: err.code, message: err.message });
      } else {
        setRequestError({ code: "UNKNOWN", message: "Failed to submit request" });
      }
    } finally {
      setSubmittingRequest(false);
    }
  };

  return (
    <div>
      {/* Hero header */}
      <div style={{ marginBottom: "2rem", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Team Discovery Board</h1>
          <p style={{ color: "var(--text-muted)", maxWidth: "600px" }}>
            Find your hackathon crew. Capacity numbers and member counts are strictly verified on-chain in MongoDB replica transactions.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Quick Invite Redeem */}
          <form onSubmit={handleRedeemInvite} style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              placeholder="Enter invite code..."
              className="input"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              style={{ width: "180px", padding: "0.5rem 0.75rem" }}
            />
            <button type="submit" className="btn btn-secondary" disabled={inviteLoading}>
              <Key size={14} />
              <span>Redeem</span>
            </button>
          </form>

          <button className="btn btn-primary" onClick={onCreateTeamClick}>
            <Plus size={16} />
            <span>Create Team</span>
          </button>
        </div>
      </div>

      {inviteSuccess && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(16, 185, 129, 0.2)", border: "1px solid #10b981", borderRadius: "8px", color: "#6ee7b7", marginBottom: "1.5rem" }}>
          {inviteSuccess}
        </div>
      )}

      {inviteError && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", borderRadius: "8px", color: "#fca5a5", marginBottom: "1.5rem" }}>
          {inviteError}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-subtle)" }} />
          <input
            type="text"
            className="input"
            placeholder="Search by team name, mission, or skills needed..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: "38px" }}
          />
        </div>

        {allSkills.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-subtle)", fontWeight: 600 }}>Filter:</span>
            <button
              className={`badge ${selectedSkill === null ? "badge-open" : "badge-skill"}`}
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedSkill(null)}
            >
              All Skills
            </button>
            {allSkills.map((skill) => (
              <button
                key={skill}
                className={`badge ${selectedSkill === skill ? "badge-open" : "badge-skill"}`}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedSkill(selectedSkill === skill ? null : skill)}
              >
                {skill}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Team Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem" }}>
        {filteredTeams.map((team) => {
          const availableSlots = team.maxMembers - team.memberCount;
          const isFull = availableSlots <= 0;

          return (
            <div key={team._id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "1.15rem", color: "#fff" }}>{team.name}</h3>
                  <span className={`badge ${isFull ? "badge-full" : "badge-open"}`}>
                    {isFull ? "Full" : `${availableSlots} seat${availableSlots > 1 ? "s" : ""} left`}
                  </span>
                </div>

                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem", minHeight: "40px" }}>
                  {team.description || "Building a high-impact solution for this hackathon."}
                </p>

                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontWeight: 600, marginBottom: "0.35rem" }}>
                    SKILLS NEEDED:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {team.skillsNeeded && team.skillsNeeded.length > 0 ? (
                      team.skillsNeeded.map((skill) => (
                        <span key={skill} className="badge badge-skill">
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "var(--text-subtle)" }}>General collaboration</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--text-subtle)" }}>
                    <UserCheck size={14} />
                    <span>{team.memberCount} / {team.maxMembers} members</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontFamily: "var(--font-mono)" }}>
                    {new Date(team.createdAt).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, fontSize: "0.8rem" }}
                    onClick={() => onSelectTeam(team._id)}
                  >
                    View Details
                  </button>

                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, fontSize: "0.8rem" }}
                    disabled={isFull || !team.lookingForMembers}
                    onClick={() => {
                      if (!user) {
                        onOpenAuth();
                      } else {
                        setRequestModalTeam(team);
                      }
                    }}
                  >
                    <span>Request to Join</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTeams.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-subtle)" }}>
          <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem", color: "#fff" }}>No teams match your search</p>
          <p style={{ fontSize: "0.9rem" }}>Try adjusting your filters or be the first to create one!</p>
        </div>
      )}

      {/* Conflict-aware Join Request Modal */}
      {requestModalTeam && (
        <div className="modal-overlay" onClick={() => setRequestModalTeam(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "1.25rem" }}>Join {requestModalTeam.name}</h2>
              <span className="badge badge-open">
                {requestModalTeam.maxMembers - requestModalTeam.memberCount} seats open
              </span>
            </div>

            {requestSuccess ? (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <CheckCircle2 size={48} style={{ color: "var(--success)", margin: "0 auto 1rem" }} />
                <h3 style={{ marginBottom: "0.5rem" }}>Request Sent!</h3>
                <p style={{ color: "var(--text-muted)" }}>
                  The team leader has been notified. You will be alerted as soon as they decide.
                </p>
              </div>
            ) : (
              <>
                {requestError && (
                  <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "8px", marginBottom: "1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#fca5a5", fontWeight: 700, marginBottom: "0.25rem" }}>
                      <AlertTriangle size={16} />
                      <span>{requestError.code === "TEAM_FULL" ? "Team Filled Up!" : "Request Failed"}</span>
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "#fca5a5" }}>
                      {requestError.code === "TEAM_FULL"
                        ? "This team filled up while your request was being processed. Your request was not accepted because the last seat was taken."
                        : requestError.message}
                    </p>

                    {/* Differentiator 3: Conflict-aware suggestion */}
                    {requestError.code === "TEAM_FULL" && (
                      <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(239, 68, 68, 0.3)" }}>
                        <div style={{ fontSize: "0.8rem", color: "#fff", fontWeight: 600, marginBottom: "0.35rem" }}>
                          Suggested teams looking for similar skills:
                        </div>
                        {teams
                          .filter((t) => t._id !== requestModalTeam._id && t.maxMembers - t.memberCount > 0)
                          .slice(0, 2)
                          .map((alt) => (
                            <button
                              key={alt._id}
                              className="btn btn-secondary"
                              style={{ width: "100%", justifyContent: "space-between", marginBottom: "0.4rem", fontSize: "0.8rem" }}
                              onClick={() => {
                                setRequestModalTeam(alt);
                                setRequestError(null);
                              }}
                            >
                              <span>{alt.name}</span>
                              <span style={{ color: "var(--success)" }}>{alt.maxMembers - alt.memberCount} seats free &rarr;</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text)" }}>
                    Introduce yourself (optional note to leader):
                  </label>
                  <textarea
                    rows={3}
                    className="textarea"
                    placeholder="Share why you'd be a great fit, your main strengths, or what you'd like to build..."
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button className="btn btn-secondary" onClick={() => setRequestModalTeam(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={submittingRequest}
                    onClick={handleSendJoinRequest}
                  >
                    <span>{submittingRequest ? "Submitting..." : "Send Request"}</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
