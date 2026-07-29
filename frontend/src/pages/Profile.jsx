import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import CircularGauge from "../CircularGauge.jsx";
import LeagueCard from "../LeagueCard.jsx";
import NextMatchRow from "../NextMatchRow.jsx";
import { UserPlusIcon } from "../Icons.jsx";
import { formatWeekLabel } from "../matchUtils.js";

export default function Profile() {
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [myLeagues, setMyLeagues] = useState([]);
  const [showMyLeagues, setShowMyLeagues] = useState(false);
  const [nextMatches, setNextMatches] = useState([]);
  const [busy, setBusy] = useState(false);

  function handleInviteToApp() {
    const url = `${window.location.origin}/login`;
    const message = t("בוא/י תצטרף/י ל-Rally, אפליקציית ניהול הליגות שלנו!\n{url}", { url });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function loadNextMatches() {
    api
      .myNextMatches()
      .then(setNextMatches)
      .catch(() => {});
  }

  useEffect(() => {
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

  let blurb = t("עדיין לא שיחקת אף משחק. השבוע זה הזמן להתחיל!");
  if (winRate !== null) {
    blurb =
      winRate >= 50
        ? t("ניצחת ב-{rate}% מהמשחקים שלך. תמשיך ככה!", { rate: winRate })
        : t("ניצחת ב-{rate}% מהמשחקים שלך. עוד יש לאן להשתפר.", { rate: winRate });
  }

  return (
    <div>
      <h1>{t("פרופיל שחקן")}</h1>

      <div className="flat-sections">
        <div className="flat-section">
          <div className="profile-header">
            <div>
              <h2 style={{ marginBottom: 2, fontSize: 24 }}>{user.name}</h2>
              <p className="muted">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="flat-section">
          {error && <p className="error">{t(error)}</p>}
          {stats && (
            <div className="hero-stat">
              <CircularGauge
                value={stats.wins}
                max={Math.max(stats.matches_played, 1)}
                size={104}
                strokeWidth={9}
              >
                <div className="gauge-value">{winRate !== null ? `${winRate}%` : "–"}</div>
                <div className="gauge-caption">{t("ניצחונות")}</div>
              </CircularGauge>
              <div className="hero-copy">
                <span className="eyebrow">{t("סטטיסטיקה")}</span>
                <p>{blurb}</p>
                <div className="chip-row">
                  <span className="chip">
                    {stats.leagues} {t("ליגות")}
                  </span>
                  <span className="chip">
                    {stats.matches_played} {t("משחקים")}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flat-section">
          <h2>
            {t("המשחקים שלי השבוע")}
            {nextMatchesForSport.length > 0 &&
              (() => {
                const first = nextMatchesForSport[0];
                const weekLabel = formatWeekLabel(first.schedule_started_at, first.match.round_number, t);
                return weekLabel ? <span className="week-label-inline"> - {weekLabel}</span> : null;
              })()}
          </h2>
          {nextMatchesForSport.length === 0 ? (
            <p className="muted">{t("אין לך ליגות עם לוח משחקים עדיין.")}</p>
          ) : (
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
          )}
        </div>

        <div className="flat-section">
          <button
            type="button"
            className="settings-row collapsible-toggle"
            onClick={() => setShowMyLeagues((v) => !v)}
          >
            <h2>{t("הליגות שלי")} ({myLeaguesForSport.length})</h2>
            <span className="muted">{showMyLeagues ? t("הסתר") : t("הצג")}</span>
          </button>

          {showMyLeagues && (
            <div className="league-grid" style={{ marginTop: 14 }}>
              {myLeaguesForSport.map((league) => (
                <LeagueCard league={league} key={league.id} />
              ))}
              {myLeaguesForSport.length === 0 && (
                <p className="muted">{t("עדיין לא הצטרפת לאף ליגה בענף הזה.")}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <button type="button" className="invite-fab" onClick={handleInviteToApp}>
        <UserPlusIcon aria-hidden="true" />
        {t("הזמן חבר")}
      </button>
    </div>
  );
}
