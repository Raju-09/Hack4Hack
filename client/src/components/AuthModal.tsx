import React, { useState } from "react";
import { User } from "../types";
import { LogIn, UserPlus, AlertCircle, Sparkles } from "lucide-react";
import { api, ApiError } from "../api/client";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [skillsStr, setSkillsStr] = useState("React, Node.js, TypeScript");
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
      if (isRegister) {
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
        setError("Authentication failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // Demo user quick-switcher
  const handleDemoLogin = async (persona: "ananya" | "karthik" | "riya") => {
    setLoading(true);
    setError(null);

    const demoUsers = {
      ananya: {
        displayName: "Ananya Sharma",
        email: "ananya.solo@crewforge.dev",
        password: "password123!",
        skills: ["react", "typescript", "tailwind"],
        timezone: "Asia/Kolkata",
        availability: 4,
        experienceLevel: "intermediate" as const,
      },
      karthik: {
        displayName: "Karthik Verma",
        email: "karthik.lead@crewforge.dev",
        password: "password123!",
        skills: ["node", "express", "mongodb", "system-design"],
        timezone: "Asia/Kolkata",
        availability: 6,
        experienceLevel: "advanced" as const,
      },
      riya: {
        displayName: "Riya Patel",
        email: "riya.organizer@crewforge.dev",
        password: "password123!",
        skills: ["python", "fastapi", "docker"],
        timezone: "UTC",
        availability: 5,
        experienceLevel: "advanced" as const,
      },
    };

    const chosen = demoUsers[persona];

    try {
      // Attempt login first
      const res = await api.login({ email: chosen.email, password: chosen.password });
      onSuccess(res.user);
      onClose();
    } catch {
      // If doesn't exist yet, auto-register
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.35rem" }}>
            {isRegister ? "Join CrewForge" : "Sign in to CrewForge"}
          </h2>
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
          >
            {isRegister ? "Have account? Sign in" : "New here? Register"}
          </button>
        </div>

        {/* Quick Demo Switcher */}
        <div style={{ marginBottom: "1.25rem", padding: "0.85rem", background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.25)", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.75rem", color: "#a5b4fc", fontWeight: 700, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <Sparkles size={14} />
            <span>JUDGES / TESTERS QUICK SWITCH:</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.75rem", flex: 1 }}
              onClick={() => handleDemoLogin("ananya")}
              disabled={loading}
            >
              Ananya (Solo)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.75rem", flex: 1 }}
              onClick={() => handleDemoLogin("karthik")}
              disabled={loading}
            >
              Karthik (Leader)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.75rem", flex: 1 }}
              onClick={() => handleDemoLogin("riya")}
              disabled={loading}
            >
              Riya (Organizer)
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: "0.75rem", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "8px", color: "#fca5a5", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {isRegister && (
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
                Display Name:
              </label>
              <input
                type="text"
                required
                className="input"
                placeholder="e.g. Ananya Sharma"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
              Email address:
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
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
              Password:
            </label>
            <input
              type="password"
              required
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {isRegister && (
            <>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
                  Skills (comma separated):
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="react, typescript, python"
                  value={skillsStr}
                  onChange={(e) => setSkillsStr(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
                    Experience:
                  </label>
                  <select
                    className="select"
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value as "beginner" | "intermediate" | "advanced")}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
                    Timezone:
                  </label>
                  <select
                    className="select"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    <option value="Asia/Kolkata">IST (UTC+5:30)</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">EST</option>
                    <option value="Europe/London">GMT</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
                    Daily Hours:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className="input"
                    value={availability}
                    onChange={(e) => setAvailability(Number(e.target.value))}
                  />
                </div>
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {isRegister ? <UserPlus size={16} /> : <LogIn size={16} />}
              <span>{loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
