import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import CircularGauge from "../CircularGauge.jsx";
import LeagueCard from "../LeagueCard.jsx";

export default function Profile() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [myLeagues, setMyLeagues] = useState([]);
  const [showMyLeagues, setShowMyLeagues] = useState(false);

  useEffect(() => {
    api
      .myStats()
      .then(setStats)
      .catch((err) => setError(err.message));
    api
      .myLeagues()
      .then(setMyLeagues)
      .catch(() => {});
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
      <h1>פרופיל שחקן</h1>

      <div className="card">
        <div className="profile-header">
          <div>
            <h2 style={{ marginBottom: 2 }}>{user.name}</h2>
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

      <section className="card">
        <button
          type="button"
          className="settings-row collapsible-toggle"
          onClick={() => setShowMyLeagues((v) => !v)}
        >
          <h2>הליגות שלי ({myLeagues.length})</h2>
          <span className="muted">{showMyLeagues ? "הסתר" : "הצג"}</span>
        </button>

        {showMyLeagues && (
          <div className="league-grid" style={{ marginTop: 14 }}>
            {myLeagues.map((league) => (
              <LeagueCard league={league} key={league.id} />
            ))}
            {myLeagues.length === 0 && <p className="muted">עדיין לא הצטרפת לאף ליגה.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
