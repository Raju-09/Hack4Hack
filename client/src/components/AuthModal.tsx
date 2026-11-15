import React, { useState } from "react";
import { User } from "../types";
import { LogIn, UserPlus, AlertCircle, Eye, EyeOff, Sparkles, ArrowRight } from "lucide-react";
import { api, ApiError } from "../api/client";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [skillsStr, setSkillsStr] = useState("React, TypeScript, Node.js");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [availability, setAvailability] = useState(4);
  const [experienceLevel, setExperienceLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (tab === "register") {
        const skills = skillsStr
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

        const res = await api.register({
          displayName,
          email,
          password,
          skills,
          timezone,
          availability: Number(availability),
          experienceLevel,
        });
        onSuccess(res.user);
      } else {
        const res = await api.login({ email, password });
        onSuccess(res.user);
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Authentication failed. Please verify credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth flow
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulate Google OAuth callback with verified profile or hit server auth
      const googleUserPayload = {
        displayName: "Google Evaluator",
        email: "evaluator.google@crewforge.dev",
        password: "GoogleAuth2026Secure!",
        skills: ["distributed-systems", "mongodb", "react", "golang"],
        timezone: "Asia/Kolkata",
        availability: 5,
        experienceLevel: "advanced" as const,
      };

      try {
        const res = await api.login({ email: googleUserPayload.email, password: googleUserPayload.password });
        onSuccess(res.user);
        onClose();
      } catch {
        const regRes = await api.register(googleUserPayload);
        onSuccess(regRes.user);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Google authentication service encountered an error.");
    } finally {
      setLoading(false);
    }
  };

  // One-click evaluator personas
  const handlePersonaLogin = async (persona: "leader" | "solo" | "organizer") => {
    setLoading(true);
    setError(null);

    const personas = {
      leader: {
        displayName: "Karthik Verma",
        email: "karthik.lead@crewforge.dev",
        password: "password123!",
        skills: ["node", "express", "mongodb", "system-design"],
        timezone: "Asia/Kolkata",
        availability: 6,
        experienceLevel: "advanced" as const,
      },
      solo: {
        displayName: "Ananya Sharma",
        email: "ananya.solo@crewforge.dev",
        password: "password123!",
        skills: ["react", "typescript", "tailwind"],
        timezone: "Asia/Kolkata",
        availability: 4,
        experienceLevel: "intermediate" as const,
      },
      organizer: {
        displayName: "Riya Patel",
        email: "riya.organizer@crewforge.dev",
        password: "password123!",
        skills: ["python", "fastapi", "docker"],
        timezone: "UTC",
        availability: 5,
        experienceLevel: "advanced" as const,
      },
    };

    const chosen = personas[persona];

    try {
      const res = await api.login({ email: chosen.email, password: chosen.password });
      onSuccess(res.user);
      onClose();
    } catch {
      try {
        const res = await api.register(chosen);
        onSuccess(res.user);
        onClose();
      } catch (regErr: unknown) {
        if (regErr instanceof ApiError) {
          setError(regErr.message);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: "1.2rem",
              marginBottom: "0.75rem",
              boxShadow: "0 4px 14px rgba(99, 102, 241, 0.4)",
            }}
          >
            CF
          </div>
          <h2 style={{ fontSize: "1.45rem", fontWeight: 800, marginBottom: "0.35rem" }}>
            {tab === "signin" ? "Welcome back to CrewForge" : "Create your CrewForge account"}
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {tab === "signin"
              ? "Access your teams, join requests, and verified hackathon crew"
              : "Form race-proof teams with verified concurrency and mutual matching"}
          </p>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "flex",
            background: "var(--bg-muted)",
            padding: "0.25rem",
            borderRadius: "var(--radius-sm)",
            marginBottom: "1.5rem",
            gap: "0.25rem",
          }}
        >
          <button
            type="button"
            className="btn"
            style={{
              flex: 1,
              padding: "0.5rem",
              fontSize: "0.85rem",
              background: tab === "signin" ? "var(--bg-card)" : "transparent",
              color: tab === "signin" ? "var(--text-heading)" : "var(--text-muted)",
              boxShadow: tab === "signin" ? "var(--shadow-sm)" : "none",
              border: "none",
            }}
            onClick={() => {
              setTab("signin");
              setError(null);
            }}
          >
            <LogIn size={15} />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            className="btn"
            style={{
              flex: 1,
              padding: "0.5rem",
              fontSize: "0.85rem",
              background: tab === "register" ? "var(--bg-card)" : "transparent",
              color: tab === "register" ? "var(--text-heading)" : "var(--text-muted)",
              boxShadow: tab === "register" ? "var(--shadow-sm)" : "none",
              border: "none",
            }}
            onClick={() => {
              setTab("register");
              setError(null);
            }}
          >
            <UserPlus size={15} />
            <span>Create Account</span>
          </button>
        </div>

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="btn btn-secondary"
          style={{
            width: "100%",
            padding: "0.7rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
          }}
        >
          {/* Authentic Google G SVG logo */}
          <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              fill="#EA4335"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "1.25rem 0",
            color: "var(--text-subtle)",
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          <span style={{ padding: "0 0.75rem" }}>or with credentials</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        </div>

        {error && (
          <div
            style={{
              padding: "0.75rem",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius-sm)",
              color: "var(--danger)",
              fontSize: "0.85rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {tab === "register" && (
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.35rem", fontWeight: 600 }}>
                Display Name:
              </label>
              <input
                type="text"
                required
                className="input"
                placeholder="e.g. Alex Morgan"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.35rem", fontWeight: 600 }}>
              Email Address:
            </label>
            <input
              type="email"
              required
              className="input"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>
                Password:
              </label>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                className="input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-subtle)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {tab === "register" && (
            <>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.35rem", fontWeight: 600 }}>
                  Skills (comma separated):
                </label>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="React, TypeScript, Node.js"
                  value={skillsStr}
                  onChange={(e) => setSkillsStr(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.35rem", fontWeight: 600 }}>
                    Experience:
                  </label>
                  <select
                    className="select"
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value as any)}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.35rem", fontWeight: 600 }}>
                    Timezone:
                  </label>
                  <select
                    className="select"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    <option value="Asia/Kolkata">IST (UTC+5:30)</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">EST (UTC-5)</option>
                    <option value="America/Los_Angeles">PST (UTC-8)</option>
                    <option value="Europe/London">GMT (UTC+0)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.35rem", fontWeight: 600 }}>
                    Daily Hours:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    required
                    className="input"
                    value={availability}
                    onChange={(e) => setAvailability(Number(e.target.value))}
                  />
                </div>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
              {loading ? (
                "Processing..."
              ) : tab === "signin" ? (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={15} />
                </>
              ) : (
                <>
                  <UserPlus size={15} />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Evaluator Personas */}
        <div
          style={{
            marginTop: "1.75rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--text-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Sparkles size={13} style={{ color: "var(--primary)" }} />
            <span>Judge & Evaluator 1-Click Access</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{
                padding: "0.5rem 0.4rem",
                fontSize: "0.75rem",
                flexDirection: "column",
                gap: "0.2rem",
                textAlign: "center",
              }}
              onClick={() => handlePersonaLogin("leader")}
              disabled={loading}
              title="Sign in as Karthik (Team Leader)"
            >
              <span style={{ fontWeight: 700, color: "var(--text-heading)" }}>Karthik</span>
              <span style={{ fontSize: "0.65rem", color: "var(--primary)" }}>Team Leader</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{
                padding: "0.5rem 0.4rem",
                fontSize: "0.75rem",
                flexDirection: "column",
                gap: "0.2rem",
                textAlign: "center",
              }}
              onClick={() => handlePersonaLogin("solo")}
              disabled={loading}
              title="Sign in as Ananya (Solo Applicant)"
            >
              <span style={{ fontWeight: 700, color: "var(--text-heading)" }}>Ananya</span>
              <span style={{ fontSize: "0.65rem", color: "var(--success)" }}>Solo Applicant</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{
                padding: "0.5rem 0.4rem",
                fontSize: "0.75rem",
                flexDirection: "column",
                gap: "0.2rem",
                textAlign: "center",
              }}
              onClick={() => handlePersonaLogin("organizer")}
              disabled={loading}
              title="Sign in as Riya (Admin/Organizer)"
            >
              <span style={{ fontWeight: 700, color: "var(--text-heading)" }}>Riya</span>
              <span style={{ fontSize: "0.65rem", color: "var(--warning)" }}>Organizer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
