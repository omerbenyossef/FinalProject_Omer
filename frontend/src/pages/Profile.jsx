import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import CircularGauge from "../CircularGauge.jsx";

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

  const winRate =
    stats && stats.matches_played > 0 ? Math.round((stats.wins / stats.matches_played) * 100) : null;

  let blurb = "עדיין לא שיחקת אף משחק. השבוע זה הזמן להתחיל!";
  if (winRate !== null) {
    blurb =
      winRate >= 50
        ? `ניצחת ב-${winRate}% מהמשחקים שלך. תמשיך ככה!`
        : `ניצחת ב-${winRate}% מהמשחקים שלך. עוד יש לאן להשתפר.`;
  }

  return (
    <div>
      <div className="card">
        <div className="profile-header">
          <div>
            <span className="eyebrow">פרופיל שחקן</span>
            <h1 style={{ marginBottom: 2 }}>{user.name}</h1>
            <p className="muted">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="card">
        {error && <p className="error">{error}</p>}
        {stats && (
          <div className="hero-stat">
            <CircularGauge
              value={stats.wins}
              max={Math.max(stats.matches_played, 1)}
              size={104}
              strokeWidth={10}
            >
              <div className="gauge-value">{stats.wins}</div>
              <div className="gauge-caption">/ {stats.matches_played} משחקים</div>
            </CircularGauge>
            <div className="hero-copy">
              <span className="eyebrow">סטטיסטיקה</span>
              <p>{blurb}</p>
              <div className="chip-row">
                <span className="chip">{stats.leagues} ליגות</span>
                {winRate !== null && <span className="chip">{winRate}% ניצחונות</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
