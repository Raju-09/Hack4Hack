import React from "react";
import { User } from "../types";
import { Users, Sparkles, Activity, ShieldCheck, LogIn, LogOut, Radio, Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

interface NavbarProps {
  user: User | null;
  activeTab: "board" | "my-team" | "matches" | "simulator";
  setActiveTab: (tab: "board" | "my-team" | "matches" | "simulator") => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onToggleDiscoverable: () => void;
  hasTeam: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  setActiveTab,
  onOpenAuth,
  onLogout,
  onToggleDiscoverable,
  hasTeam,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--nav-bg)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "68px",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.65rem", cursor: "pointer" }}
            onClick={() => setActiveTab("board")}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                boxShadow: "0 2px 10px rgba(99, 102, 241, 0.35)",
              }}
            >
              CF
            </div>
            <div>
              <div
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "var(--text-heading)",
                  lineHeight: 1.1,
                }}
              >
                CrewForge
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-subtle)", fontWeight: 600 }}>
                Race-Proof Team Formation
              </div>
            </div>
          </div>

          <div className="badge badge-open" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Radio size={12} className="animate-pulse" />
            <span>RS0 Live</span>
          </div>
        </div>

        {/* Navigation tabs */}
        <nav style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={`btn ${activeTab === "board" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("board")}
            style={{ fontSize: "0.85rem" }}
          >
            <Users size={16} />
            <span>Teams</span>
          </button>

          {hasTeam && (
            <button
              className={`btn ${activeTab === "my-team" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveTab("my-team")}
              style={{ fontSize: "0.85rem" }}
            >
              <ShieldCheck size={16} />
              <span>My Team</span>
            </button>
          )}

          <button
            className={`btn ${activeTab === "matches" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("matches")}
            style={{ fontSize: "0.85rem" }}
          >
            <Sparkles size={16} />
            <span>Matchmaker</span>
          </button>

          <button
            className={`btn ${activeTab === "simulator" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("simulator")}
            style={{ fontSize: "0.85rem" }}
          >
            <Activity size={16} />
            <span>Race Simulator</span>
          </button>
        </nav>

        {/* Right side: Theme toggle & User profile / Auth */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="btn btn-secondary"
            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            style={{
              padding: "0.5rem",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Toggle Theme"
          >
            {theme === "dark" ? (
              <Sun size={17} style={{ color: "#fbbf24" }} />
            ) : (
              <Moon size={17} style={{ color: "#4f46e5" }} />
            )}
          </button>

          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
              <button
                onClick={onToggleDiscoverable}
                className="btn btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.35rem 0.65rem" }}
                title="Click to toggle public board discoverability"
              >
                Board: {user.discoverable ? "🟢 Opted-In" : "⚪ Hidden"}
              </button>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-heading)" }}>
                  {user.displayName}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-subtle)" }}>
                  {user.skills.slice(0, 2).join(", ") || "No skills"}
                </div>
              </div>

              <button className="btn btn-secondary" onClick={onLogout} title="Sign Out" style={{ padding: "0.5rem" }}>
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={onOpenAuth}>
              <LogIn size={16} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
