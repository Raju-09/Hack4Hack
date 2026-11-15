import React, { useState } from "react";
import { Plus, AlertCircle } from "lucide-react";
import { api, ApiError } from "../api/client";

interface CreateTeamModalProps {
  isOpen: boolean;
  hackathonId: string;
  onClose: () => void;
  onSuccess: (teamId: string) => void;
}

export const CreateTeamModal: React.FC<CreateTeamModalProps> = ({
  isOpen,
  hackathonId,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxMembers, setMaxMembers] = useState(4);
  const [skillsStr, setSkillsStr] = useState("React, Node.js");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const skillsNeeded = skillsStr
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    try {
      const res = await api.createTeam({
        hackathonId,
        name,
        description,
        maxMembers: Number(maxMembers),
        skillsNeeded,
        lookingForMembers: true,
      });
      onSuccess(res.team._id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create team");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>Create New Team</h2>

        {error && (
          <div style={{ padding: "0.75rem", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "8px", color: "#fca5a5", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
              Team Name:
            </label>
            <input
              type="text"
              required
              className="input"
              placeholder="e.g. Distributed Pioneers"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
              Mission / Description:
            </label>
            <textarea
              rows={3}
              className="textarea"
              placeholder="What are you building? What kind of teammates are you searching for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
                Max Members (2-5):
              </label>
              <input
                type="number"
                min={2}
                max={5}
                required
                className="input"
                value={maxMembers}
                onChange={(e) => setMaxMembers(Number(e.target.value))}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", marginBottom: "0.3rem" }}>
                Skills Needed:
              </label>
              <input
                type="text"
                className="input"
                placeholder="frontend, backend, ml"
                value={skillsStr}
                onChange={(e) => setSkillsStr(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Plus size={16} />
              <span>{loading ? "Creating..." : "Create Team"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
