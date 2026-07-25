import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import Avatar from "../Avatar.jsx";

export default function Profile() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .myStats()
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  if (!user) return null;

  return (
    <div>
      <div className="card">
        <div className="profile-header">
          <Avatar name={user.name} id={user.id} size={48} />
          <div>
            <span className="eyebrow">פרופיל שחקן</span>
            <h1 style={{ marginBottom: 2 }}>{user.name}</h1>
            <p className="muted">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>סטטיסטיקה</h2>
        {error && <p className="error">{error}</p>}
        {stats && (
          <div className="stat-row">
            <StatTile value={stats.leagues} label="ליגות" />
            <StatTile value={stats.matches_played} label="משחקים" />
            <StatTile value={stats.wins} label="נצחונות" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ value, label }) {
  return (
    <div className="stat-tile">
      <div className="stat-value">{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}
