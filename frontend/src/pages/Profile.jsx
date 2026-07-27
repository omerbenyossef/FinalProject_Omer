import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import CircularGauge from "../CircularGauge.jsx";
import LeagueCard from "../LeagueCard.jsx";
import NextMatchRow from "../NextMatchRow.jsx";
import SportTabs from "../SportTabs.jsx";
import { UserPlusIcon } from "../Icons.jsx";
import { getStoredSportId, setStoredSportId } from "../sportPreference.js";

export default function Profile() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [sports, setSports] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState(getStoredSportId());
  const [myLeagues, setMyLeagues] = useState([]);
  const [showMyLeagues, setShowMyLeagues] = useState(false);
  const [nextMatches, setNextMatches] = useState([]);
  const [busy, setBusy] = useState(false);

  function handleInviteToApp() {
    const url = `${window.location.origin}/login`;
    const message = `בוא/י תצטרף/י ל-Rally, אפליקציית ניהול הליגות שלנו!\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function loadNextMatches() {
    api
      .myNextMatches()
      .then(setNextMatches)
      .catch(() => {});
  }

  useEffect(() => {
    api.listSports().then((sportsData) => {
      setSports(sportsData);
      setSelectedSportId((current) =>
        current && sportsData.some((s) => s.id === current) ? current : sportsData[0]?.id ?? null
      );
    });
    api
      .myLeagues()
      .then(setMyLeagues)
      .catch(() => {});
    loadNextMatches();
  }, []);

  useEffect(() => {
    if (!selectedSportId) return;
    api
      .myStats(selectedSportId)
      .then(setStats)
      .catch((err) => setError(err.message));
  }, [selectedSportId]);

  function handleSelectSport(id) {
    setSelectedSportId(id);
    setStoredSportId(id);
  }

  async function handleReportScore(leagueId, matchId, sets) {
    setBusy(true);
    try {
      await api.reportScore(leagueId, matchId, sets);
      loadNextMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  const myLeaguesForSport = myLeagues.filter((l) => l.sport.id === selectedSportId);
  const myLeagueIdsForSport = new Set(myLeaguesForSport.map((l) => l.id));
  const nextMatchesForSport = nextMatches.filter((entry) => myLeagueIdsForSport.has(entry.league_id));

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
            <h2 style={{ marginBottom: 2, fontSize: 24 }}>{user.name}</h2>
            <p className="muted">{user.email}</p>
          </div>
        </div>
      </div>

      <SportTabs sports={sports} selected={selectedSportId} onSelect={handleSelectSport} />

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
              <div className="gauge-caption">{winRate !== null ? `${winRate}% ניצחונות` : "אין עדיין"}</div>
            </CircularGauge>
            <div className="hero-copy">
              <span className="eyebrow">סטטיסטיקה</span>
              <p>{blurb}</p>
              <div className="chip-row">
                <span className="chip">{stats.leagues} ליגות</span>
                <span className="chip">{stats.matches_played} משחקים</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {nextMatchesForSport.length > 0 && (
        <section className="card">
          <h2>המשחקים הבאים שלי</h2>
          <ul className="match-list">
            {nextMatchesForSport.map((entry) => (
              <NextMatchRow
                key={entry.match.id}
                match={entry.match}
                currentUserId={user.id}
                leagueName={entry.league_name}
                leagueId={entry.league_id}
                busy={busy}
                onSubmit={(sets) => handleReportScore(entry.league_id, entry.match.id, sets)}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <button
          type="button"
          className="settings-row collapsible-toggle"
          onClick={() => setShowMyLeagues((v) => !v)}
        >
          <h2>הליגות שלי ({myLeaguesForSport.length})</h2>
          <span className="muted">{showMyLeagues ? "הסתר" : "הצג"}</span>
        </button>

        {showMyLeagues && (
          <div className="league-grid" style={{ marginTop: 14 }}>
            {myLeaguesForSport.map((league) => (
              <LeagueCard league={league} key={league.id} />
            ))}
            {myLeaguesForSport.length === 0 && (
              <p className="muted">עדיין לא הצטרפת לאף ליגה בענף הזה.</p>
            )}
          </div>
        )}
      </section>

      <button type="button" className="invite-fab" onClick={handleInviteToApp}>
        <UserPlusIcon aria-hidden="true" />
        הזמן חבר
      </button>
    </div>
  );
}
