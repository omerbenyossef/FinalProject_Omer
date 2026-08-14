import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import NextMatchRow from "../NextMatchRow.jsx";
import Avatar from "../Avatar.jsx";
import { CalendarIcon, TrophyIcon, TrendDownIcon, TrendUpIcon, ChevronIcon } from "../Icons.jsx";
import { formatWeekShort, formatDayMonth } from "../matchUtils.js";
import EmptyState from "../EmptyState.jsx";
import { SkeletonHeroStat, SkeletonMatchRow } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";

function formatMySets(sets) {
  if (!sets || sets.length === 0) return "";
  return sets.map((s) => `${s.player1_games}-${s.player2_games}`).join(" ");
}

export default function Profile() {
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [myLeagues, setMyLeagues] = useState([]);
  const [nextMatches, setNextMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  function loadNextMatches() {
    api
      .myNextMatches()
      .then(setNextMatches)
      .catch(() => {})
      .finally(() => setMatchesLoading(false));
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
  const nextMatchesForSport = nextMatches.filter(
    (entry) => myLeagueIdsForSport.has(entry.league_id) && entry.match.status !== "completed"
  );

  const winRate =
    stats && stats.matches_played > 0 ? Math.round((stats.wins / stats.matches_played) * 100) : null;

  const formStrip = stats ? stats.recent_matches.slice(0, 8) : [];
  const recentResults = stats ? stats.recent_matches.slice(0, 3) : [];
  const myLeaguesPreview = myLeaguesForSport.slice(0, 2);

  return (
    <div className="profile-scoreboard">
      <header className="page-head">
        <div className="profile-season-row">
          <span className="profile-season-eyebrow">
            {t("{name} · {season}", { name: user.name, season: t("העונה") })}
          </span>
          <PageHelp
            pageKey="profile"
            title="עמוד הפרופיל"
            text="כאן תראו את אחוז הניצחונות שלכם, את המשחק הבא שלכם השבוע, ואת רשימת הליגות שאתם חברים בהן."
          />
        </div>

        {error && <p className="error">{t(error)}</p>}
        {!stats && !error && <SkeletonHeroStat />}

        {stats && (
          <div className="profile-season-block">
            <div className="profile-winrate-row">
              <div className="profile-winrate-value" dir="ltr">
                <span className="profile-winrate-number">{winRate !== null ? winRate : "–"}</span>
                <span className="profile-winrate-percent">%</span>
              </div>
              <div className="profile-winrate-label">
                <div className="profile-winrate-title">{t("אחוז ניצחונות")}</div>
                <div className="profile-winrate-record" dir="ltr">
                  {stats.wins}W · {stats.losses}L
                </div>
              </div>
            </div>

            {formStrip.length > 0 && (
              <>
                <div className="profile-form-strip">
                  {formStrip.map((m, i) => (
                    <span key={i} className={`profile-form-bar${m.won ? " win" : ""}`} />
                  ))}
                </div>
                <div className="profile-form-caption">
                  {formStrip.length} {t("המשחקים האחרונים")}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {stats && (
        <>
          <div className="profile-section">
            <div className="profile-section-header">
              <span>{t("הליגות שלי")}</span>
              {myLeaguesForSport.length > myLeaguesPreview.length ? (
                <Link to="/leagues" className="profile-section-header-link">
                  {t("כל ה-{n}", { n: myLeaguesForSport.length })}
                </Link>
              ) : (
                <span>{t("דירוג")}</span>
              )}
            </div>
            <div className="rank-row-list">
              {myLeaguesPreview.map((league) => (
                <Link to={`/leagues/${league.id}`} key={league.id} className="rank-row">
                  <span className={`rank-row-number${league.my_rank <= 3 ? " top" : ""}`} dir="ltr">
                    #{league.my_rank}
                  </span>
                  <div className="rank-row-body">
                    <div className="rank-row-name">{league.name}</div>
                    <div className="rank-row-record" dir="ltr">
                      {league.my_wins}W-{league.my_losses}L / {league.my_members_total} players
                    </div>
                  </div>
                  {league.my_rank_trend ? (
                    <span className={`rank-row-trend ${league.my_rank_trend < 0 ? "down" : "up"}`} dir="ltr">
                      {league.my_rank_trend < 0 ? (
                        <TrendDownIcon aria-hidden="true" />
                      ) : (
                        <TrendUpIcon aria-hidden="true" />
                      )}
                      {Math.abs(league.my_rank_trend)}
                    </span>
                  ) : (
                    <span className="rank-row-trend flat">—</span>
                  )}
                </Link>
              ))}
              {myLeaguesForSport.length === 0 && (
                <EmptyState
                  icon={<TrophyIcon aria-hidden="true" />}
                  action={
                    <Link to="/leagues" className="btn-secondary btn-small">
                      {t("עיין בליגות")}
                    </Link>
                  }
                >
                  {t("עדיין לא הצטרפת לאף ליגה בענף הזה.")}
                </EmptyState>
              )}
            </div>
          </div>
        </>
      )}

      {matchesLoading ? (
        <ul className="match-list">
          <SkeletonMatchRow />
        </ul>
      ) : nextMatchesForSport.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon aria-hidden="true" />}
          action={
            <Link to="/leagues" className="btn-secondary btn-small">
              {t("עיין בליגות")}
            </Link>
          }
        >
          {t("אין לך ליגות עם לוח משחקים עדיין.")}
        </EmptyState>
      ) : (
        <ul className="match-list">
          {nextMatchesForSport.map((entry) => (
            <NextMatchRow
              key={entry.match.id}
              match={entry.match}
              currentUserId={user.id}
              leagueName={entry.league_name}
              leagueId={entry.league_id}
              weekLabel={formatWeekShort(entry.match.round_number, t)}
              busy={busy}
              onSubmit={(sets) => handleReportScore(entry.league_id, entry.match.id, sets)}
            />
          ))}
        </ul>
      )}

      {stats && recentResults.length > 0 && (
        <div className="profile-section">
          <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
            <span>{t("תוצאות אחרונות")}</span>
          </div>
          <div className="recent-result-card-list">
            {recentResults.map((m, i) => (
              <Link
                to={`/head-to-head/${m.opponent_id}`}
                className={`recent-result-card${m.won ? " win" : ""}`}
                key={i}
              >
                <Avatar name={m.opponent_name} size={32} />
                <div className="recent-result-card-body">
                  <div className="recent-result-card-name">{m.opponent_name}</div>
                  <div className="recent-result-card-meta">
                    {[m.league_name, m.played_at ? formatDayMonth(new Date(m.played_at)) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="recent-result-card-side">
                  <span className={`recent-result-card-score${m.won ? " win" : ""}`} dir="ltr">
                    {formatMySets(m.my_sets)}
                  </span>
                  <span className={`match-result-badge ${m.won ? "win" : "loss"}`}>
                    {m.won ? "W" : "L"}
                  </span>
                  <ChevronIcon className="recent-result-card-chevron chevron-icon" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
