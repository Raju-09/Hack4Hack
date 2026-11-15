import React, { useState, useEffect } from "react";
import { MatchRecommendation, User } from "../types";
import { Sparkles, Compass, CheckCircle2, Send, Info } from "lucide-react";
import { api } from "../api/client";

interface TeammateMatchingProps {
  hackathonId: string;
  user: User | null;
  teamId?: string;
  onOpenAuth: () => void;
}

export const TeammateMatching: React.FC<TeammateMatchingProps> = ({
  hackathonId,
  user,
  teamId,
  onOpenAuth,
}) => {
  const [matches, setMatches] = useState<MatchRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [invitedMap, setInvitedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchMatches = async () => {
      try {
        const res = await api.getMatches(hackathonId, teamId);
        setMatches(res.matches || []);
      } catch (err) {
        console.error("Match fetch failed", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, [hackathonId, user, teamId]);

  if (!user) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <Sparkles size={40} style={{ color: "var(--primary)", margin: "0 auto 1rem" }} />
        <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Sign in to view recommendations</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          Our deterministic matching engine ranks available participants based on complementary skills, time zone compatibility, and availability overlap.
        </p>
        <button className="btn btn-primary" onClick={onOpenAuth}>
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <Sparkles size={24} style={{ color: "#a855f7" }} />
          <h1 style={{ fontSize: "2rem" }}>Explainable Teammate Matching</h1>
        </div>
        <p style={{ color: "var(--text-muted)" }}>
          Transparent, deterministic ranking based on hackathon synergy. No black-box AI claims.
        </p>
      </div>

      {/* Model explanation banner */}
      <div className="card" style={{ marginBottom: "2rem", background: "rgba(99, 102, 241, 0.08)", borderColor: "rgba(99, 102, 241, 0.25)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <Info size={20} style={{ color: "var(--primary)", marginTop: "2px", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: "0.25rem" }}>
              Matching Model Formula:
            </div>
            <div className="code-box" style={{ display: "inline-block", padding: "0.3rem 0.6rem", margin: "0.25rem 0", color: "#a5b4fc" }}>
              Score = 0.50·SkillScore + 0.30·TimezoneScore + 0.20·AvailabilityScore
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
              Scores are calculated directly against your team's unfilled skills and meeting time overlap. Opt-in discovery ensures participants want to be contacted.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          Computing best compatibility matches...
        </div>
      ) : matches.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-subtle)" }}>
          <Compass size={36} style={{ margin: "0 auto 0.75rem", opacity: 0.5 }} />
          <p style={{ fontSize: "1rem", color: "#fff", marginBottom: "0.5rem" }}>No discoverable participants found</p>
          <p style={{ fontSize: "0.85rem" }}>
            Make sure your profile has <strong>Discoverable</strong> turned on, or wait for more candidates to opt in!
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "1.5rem" }}>
          {matches.map(({ user: candidate, score }) => {
            const percentage = Math.round(score.total * 100);

            return (
              <div key={candidate._id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  {/* Top Bar: Name + Score */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div>
                      <h3 style={{ fontSize: "1.1rem", color: "#fff" }}>{candidate.displayName}</h3>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>
                        {candidate.timezone} · {candidate.experienceLevel}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="badge badge-open" style={{ fontSize: "0.85rem", padding: "0.3rem 0.65rem", background: "rgba(99, 102, 241, 0.2)", borderColor: "var(--primary)", color: "#a5b4fc" }}>
                        {percentage}% Match
                      </span>
                    </div>
                  </div>

                  {/* Match Factors Breakdown */}
                  <div style={{ marginBottom: "1rem", background: "rgba(0, 0, 0, 0.3)", padding: "0.75rem", borderRadius: "8px" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontWeight: 600, marginBottom: "0.5rem" }}>
                      SCORE BREAKDOWN:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.8rem" }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                          <span style={{ color: "var(--text-muted)" }}>Skill Complement:</span>
                          <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(score.skillScore * 100)}%</span>
                        </div>
                        <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${score.skillScore * 100}%`, background: "var(--primary)" }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                          <span style={{ color: "var(--text-muted)" }}>Timezone Overlap:</span>
                          <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(score.timezoneScore * 100)}%</span>
                        </div>
                        <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${score.timezoneScore * 100}%`, background: "#3b82f6" }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                          <span style={{ color: "var(--text-muted)" }}>Availability ({candidate.availability}h/day):</span>
                          <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(score.availabilityScore * 100)}%</span>
                        </div>
                        <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${score.availabilityScore * 100}%`, background: "var(--success)" }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Why this match? */}
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontWeight: 600, marginBottom: "0.35rem" }}>
                      WHY THIS MATCH:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                      {score.matchReasons.map((reason, idx) => (
                        <span key={idx} className="badge badge-open" style={{ fontSize: "0.7rem", textTransform: "none" }}>
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Candidate Bio */}
                  {candidate.bio && (
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem", fontStyle: "italic" }}>
                      "{candidate.bio}"
                    </p>
                  )}

                  {/* Candidate Skills */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "1.25rem" }}>
                    {candidate.skills.map((skill) => (
                      <span key={skill} className="badge badge-skill" style={{ fontSize: "0.75rem" }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                  <button
                    className={`btn ${invitedMap[candidate._id] ? "btn-success" : "btn-primary"}`}
                    style={{ width: "100%", fontSize: "0.85rem" }}
                    onClick={() => {
                      setInvitedMap((prev) => ({ ...prev, [candidate._id]: true }));
                    }}
                  >
                    {invitedMap[candidate._id] ? (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Invitation Link Generated</span>
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        <span>Send Team Invitation</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
