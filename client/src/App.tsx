import React, { useState, useEffect, useCallback } from "react";
import { User, Team } from "./types";
import { Navbar } from "./components/Navbar";
import { DiscoveryBoard } from "./components/DiscoveryBoard";
import { TeamDashboard } from "./components/TeamDashboard";
import { TeammateMatching } from "./components/TeammateMatching";
import { ConcurrencySimulator } from "./components/ConcurrencySimulator";
import { AuthModal } from "./components/AuthModal";
import { CreateTeamModal } from "./components/CreateTeamModal";
import { useSSE } from "./hooks/useSSE";
import { api } from "./api/client";
import { Radio } from "lucide-react";

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"board" | "my-team" | "matches" | "simulator">("board");
  const [hackathonId] = useState<string>("000000000000000000000001"); // Default active hackathon
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [liveNotification, setLiveNotification] = useState<string | null>(null);

  // Load active user session
  const fetchUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      setUser(res.user);
    } catch {
      setUser(null);
    }
  }, []);

  // Load teams
  const fetchTeams = useCallback(async () => {
    try {
      const res = await api.getTeams("?limit=50");
      setTeams(res.teams || []);

      // If user is logged in, find their team
      if (user) {
        const userTeam = res.teams?.find((t) => String(t.leaderId) === String(user._id));
        if (userTeam) setMyTeamId(userTeam._id);
      }
    } catch (e) {
      console.error("Fetch teams failed", e);
    }
  }, [user]);

  useEffect(() => {
    fetchUser();
    fetchTeams();
  }, [fetchUser, fetchTeams]);

  // Server-Sent Events listener for real-time updates
  useSSE(hackathonId, (eventType, _data) => {
    // Show live toast banner
    const eventLabels: Record<string, string> = {
      "team.created": "New team created on the board",
      "team.member_joined": "Member joined a team!",
      "team.member_left": "Member left team",
      "team.leader_changed": "Team leadership was transferred",
      "team.deleted": "A team was disbanded",
      "join_request.accepted": "A join request was accepted",
    };

    setLiveNotification(eventLabels[eventType] || `Event: ${eventType}`);
    setTimeout(() => setLiveNotification(null), 4000);

    // Refresh teams list
    fetchTeams();
  });

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      setMyTeamId(null);
      if (activeTab === "my-team") setActiveTab("board");
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const handleToggleDiscoverable = async () => {
    if (!user) return;
    try {
      const res = await api.setDiscoverable(!user.discoverable);
      setUser({ ...user, discoverable: res.discoverable });
    } catch (e) {
      console.error("Discoverable toggle failed", e);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === "my-team" && myTeamId) {
            setSelectedTeamId(myTeamId);
          }
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        onToggleDiscoverable={handleToggleDiscoverable}
        hasTeam={Boolean(myTeamId)}
      />

      {/* Real-time SSE Live Toast Banner */}
      {liveNotification && (
        <div style={{ background: "rgba(99, 102, 241, 0.9)", color: "#fff", padding: "0.5rem 1rem", fontSize: "0.85rem", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", position: "sticky", top: "68px", zIndex: 90, backdropFilter: "blur(4px)" }}>
          <Radio size={14} className="animate-pulse" />
          <span><strong>Real-Time Update:</strong> {liveNotification}</span>
        </div>
      )}

      <main className="container" style={{ flex: 1, padding: "2.5rem 1.5rem" }}>
        {activeTab === "board" && (
          <DiscoveryBoard
            teams={teams}
            user={user}
            onSelectTeam={(teamId) => {
              setSelectedTeamId(teamId);
              setActiveTab("my-team");
            }}
            onCreateTeamClick={() => {
              if (!user) setAuthModalOpen(true);
              else setCreateTeamModalOpen(true);
            }}
            onRefresh={fetchTeams}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {activeTab === "my-team" && (
          <TeamDashboard
            teamId={selectedTeamId || myTeamId || (teams[0]?._id ?? "")}
            user={user}
            onLeaveSuccess={() => {
              setMyTeamId(null);
              setSelectedTeamId(null);
              setActiveTab("board");
            }}
            onRefreshBoard={fetchTeams}
          />
        )}

        {activeTab === "matches" && (
          <TeammateMatching
            hackathonId={hackathonId}
            user={user}
            teamId={myTeamId || undefined}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {activeTab === "simulator" && <ConcurrencySimulator />}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "2rem 0", color: "var(--text-subtle)", fontSize: "0.8rem", textAlign: "center", background: "var(--bg-card-subtle)" }}>
        <div className="container">
          <p style={{ marginBottom: "0.5rem" }}>
            <strong>CrewForge</strong> · Hack4Hack Crew Hiring Challenge 2026 (PS1: Race-Proof Team Formation at Scale)
          </p>
          <p>
            Engineered with strict multi-document MongoDB Replica Set transactions, persistent idempotency, and WCAG 2.2 AA accessibility.
          </p>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(newUser) => {
          setUser(newUser);
          fetchTeams();
        }}
      />

      <CreateTeamModal
        isOpen={createTeamModalOpen}
        hackathonId={hackathonId}
        onClose={() => setCreateTeamModalOpen(false)}
        onSuccess={(newTeamId) => {
          setMyTeamId(newTeamId);
          setSelectedTeamId(newTeamId);
          setActiveTab("my-team");
          fetchTeams();
        }}
      />
    </div>
  );
};
