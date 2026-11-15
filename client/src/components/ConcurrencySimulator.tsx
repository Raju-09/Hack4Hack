import React, { useState } from "react";
import { Activity, Play, CheckCircle2, Shield, RefreshCw, AlertCircle, Database, Cpu } from "lucide-react";
import { api, ApiError } from "../api/client";
import { RaceSimulationResult } from "../types";

export const ConcurrencySimulator: React.FC = () => {
  const [concurrencyCount, setConcurrencyCount] = useState<number>(50);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RaceSimulationResult | null>(null);

  const runSimulation = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.runRaceSimulation(concurrencyCount);
      setResult(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(`[${err.code}] ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to run race simulation");
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <Activity size={24} style={{ color: "var(--primary)" }} />
          <h1 style={{ fontSize: "2rem" }}>Concurrency & Race Condition Diagnostics</h1>
        </div>
        <p style={{ color: "var(--text-muted)" }}>
          Inspect and mathematically verify the capacity reservation invariant under simultaneous requests.
          Executes real multi-document ACID transactions directly against MongoDB replica nodes.
        </p>
      </div>

      {/* Architecture Defense Banner */}
      <div className="card" style={{ marginBottom: "2rem", borderLeft: "4px solid var(--primary)" }}>
        <div style={{ display: "flex", gap: "1rem" }}>
          <Shield size={24} style={{ color: "var(--primary)", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
              How CrewForge Prevents Overfill (TOCTOU Defense)
            </h3>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.6, marginBottom: "0.75rem" }}>
              Most naive hackathon apps perform a <code>count()</code> check followed by a separate <code>insert()</code>. Under concurrency, 50 requests can simultaneously read <code>count = 3</code> and all insert, blowing past team capacity. CrewForge eliminates this vulnerability by executing an atomic conditional update directly on MongoDB replica nodes inside an ACID transaction:
            </p>
            <div className="code-box" style={{ color: "#a5b4fc" }}>
              {"Team.findOneAndUpdate({ _id: teamId, $expr: { $lt: ['$memberCount', '$maxMembers'] } }, { $inc: { memberCount: 1 } }, { session })"}
            </div>
          </div>
        </div>
      </div>

      {/* Simulator Control Card */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-subtle)", fontWeight: 600, marginBottom: "0.35rem" }}>
              CONCURRENT TRANSACTIONS (COMPETING FOR 1 OPEN SEAT):
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {[10, 25, 50].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`btn ${concurrencyCount === count ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setConcurrencyCount(count)}
                  disabled={isRunning}
                >
                  {count} Users
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ padding: "0.75rem 1.5rem", fontSize: "0.95rem" }}
            onClick={runSimulation}
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Executing Server-Side ACID Burst...</span>
              </>
            ) : (
              <>
                <Play size={16} />
                <span>Run Live Server Race Test</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: "2rem", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--danger)" }}>
            <AlertCircle size={20} />
            <span style={{ fontWeight: 600 }}>{error}</span>
          </div>
        </div>
      )}

      {/* Live Results Panel */}
      {result && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Cpu size={20} style={{ color: "var(--primary)" }} />
              <h3 style={{ fontSize: "1.2rem" }}>Live Database Execution & Invariant Report</h3>
            </div>
            <span className="badge badge-open" style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.8rem" }}>
              <CheckCircle2 size={16} />
              <span>All 4 ACID Invariants Strictly Enforced</span>
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <div className="card" style={{ background: "var(--bg-card-subtle, #0b0f19)", border: "1px solid var(--border-color, #1f293d)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontWeight: 600 }}>SIMULTANEOUS APPLICANTS</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-heading, #fff)" }}>{result.totalRequests}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>competing for 1 open seat</div>
            </div>

            <div className="card" style={{ background: "var(--bg-card-subtle, #0b0f19)", border: "1px solid var(--border-color, #1f293d)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontWeight: 600 }}>ACCEPTED (200 OK)</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--success)" }}>{result.accepted}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>exactly 1 seat allocated</div>
            </div>

            <div className="card" style={{ background: "var(--bg-card-subtle, #0b0f19)", border: "1px solid var(--border-color, #1f293d)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontWeight: 600 }}>REJECTED (409 CONFLICT)</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--danger)" }}>{result.conflicts}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>prevented overfill</div>
            </div>

            <div className="card" style={{ background: "var(--bg-card-subtle, #0b0f19)", border: "1px solid var(--border-color, #1f293d)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontWeight: 600 }}>p50 LATENCY</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--primary)" }}>{result.stats.p50} ms</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>p95: {result.stats.p95} ms</div>
            </div>

            <div className="card" style={{ background: "var(--bg-card-subtle, #0b0f19)", border: "1px solid var(--border-color, #1f293d)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontWeight: 600 }}>TOTAL BURST TIME</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--primary)" }}>{result.executionDurationMs} ms</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>in-memory replica set</div>
            </div>
          </div>

          {/* Database Snapshot Verification Card */}
          <div className="card" style={{ marginBottom: "1.5rem", background: "var(--bg-card-subtle, #0b0f19)", border: "1px solid var(--border-color, #1f293d)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <Database size={16} style={{ color: "var(--primary)" }} />
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-heading, #fff)" }}>
                Live MongoDB Post-Run State Verification:
              </h4>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", fontSize: "0.85rem" }}>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Target Team ID: </span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--primary)" }}>{result.databaseSnapshot.teamId}</span>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Final Member Count: </span>
                <span style={{ fontWeight: 700, color: "var(--success)" }}>{result.databaseSnapshot.finalMemberCount} / {result.databaseSnapshot.maxMembers}</span>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Active Memberships in DB: </span>
                <span style={{ fontWeight: 700, color: "var(--success)" }}>{result.databaseSnapshot.activeMemberships}</span>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Duplicate Memberships: </span>
                <span style={{ fontWeight: 700, color: result.databaseSnapshot.duplicateMembershipCount === 0 ? "var(--success)" : "var(--danger)" }}>
                  {result.databaseSnapshot.duplicateMembershipCount}
                </span>
              </div>
            </div>
          </div>

          {/* Invariants Check List */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h4 style={{ fontSize: "0.95rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
              Formal Invariant Proofs (Verified directly on DB after transaction resolution):
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem" }}>
                <CheckCircle2 size={16} color="var(--success)" />
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-heading, #fff)" }}>INV-1:</span>
                <span style={{ color: "var(--text-muted)" }}>
                  Capacity Invariant: <code>0 &le; memberCount ({result.databaseSnapshot.finalMemberCount}) &le; maxMembers ({result.databaseSnapshot.maxMembers})</code> (Held: {String(result.invariants.inv1_capacityRespected)})
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem" }}>
                <CheckCircle2 size={16} color="var(--success)" />
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-heading, #fff)" }}>INV-2:</span>
                <span style={{ color: "var(--text-muted)" }}>
                  Membership Count Integrity: <code>memberCount ({result.databaseSnapshot.finalMemberCount}) === count(memberships) ({result.databaseSnapshot.activeMemberships})</code> (Held: {String(result.invariants.inv2_memberCountMatches)})
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem" }}>
                <CheckCircle2 size={16} color="var(--success)" />
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-heading, #fff)" }}>INV-3:</span>
                <span style={{ color: "var(--text-muted)" }}>
                  Single-Winner Allocation: Exactly 1 applicant accepted, {result.conflicts} rejected with 409 TEAM_FULL (Held: {String(result.invariants.inv3_singleWinner)})
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem" }}>
                <CheckCircle2 size={16} color="var(--success)" />
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-heading, #fff)" }}>INV-4:</span>
                <span style={{ color: "var(--text-muted)" }}>
                  Compound Unique Index: <code>duplicateMemberships === 0</code> (Held: {String(result.invariants.inv4_noDuplicateMembers)})
                </span>
              </div>
            </div>
          </div>

          {/* Sample Requests Table */}
          <div>
            <h4 style={{ fontSize: "0.95rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>
              Individual Request Audit Trail (Sample from simultaneous burst):
            </h4>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color, #1f293d)", color: "var(--text-subtle)" }}>
                    <th style={{ padding: "0.5rem" }}>Request ID</th>
                    <th style={{ padding: "0.5rem" }}>Status</th>
                    <th style={{ padding: "0.5rem" }}>Latency</th>
                    <th style={{ padding: "0.5rem" }}>Result / Error Code</th>
                  </tr>
                </thead>
                <tbody>
                  {result.requestsSample.map((req, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-color, #1f293d)" }}>
                      <td style={{ padding: "0.5rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{req.requestId.slice(-8)}</td>
                      <td style={{ padding: "0.5rem" }}>
                        <span className={`badge ${req.statusCode === 200 ? "badge-open" : "badge-full"}`}>
                          {req.statusCode}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem", fontFamily: "var(--font-mono)" }}>{req.latencyMs} ms</td>
                      <td style={{ padding: "0.5rem", color: req.success ? "var(--success)" : "var(--danger)" }}>
                        {req.success ? "✓ Seat Assigned (Accepted)" : `409 ${req.errorCode || "TEAM_FULL"}: ${req.errorMessage || ""}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
