import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { formatDayMonth, roundDueDateObj } from "../matchUtils.js";
import { SkeletonPageHeader, SkeletonHeroStat } from "../Skeleton.jsx";

export default function RoundDetail() {
  const { leagueId, round } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const roundNumber = Number(round);

  const [league, setLeague] = useState(null);
  const [allMatches, setAllMatches] = useState([]);
  const [myMatches, setMyMatches] = useState([]);
  const [h2h, setH2h] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reminded, setReminded] = useState({});

  async function loadAll() {
    try {
      const [leagueData, allMatchesData, myMatchesData] = await Promise.all([
        api.getLeague(leagueId),
        api.listAllMatches(leagueId),
        api.listMatches(leagueId),
      ]);
      setLeague(leagueData);
      setAllMatches(allMatchesData);
      setMyMatches(myMatchesData);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, round]);

  const roundMatches = allMatches.filter((m) => m.round_number === roundNumber);
  const myMatch = myMatches.find((m) => m.round_number === roundNumber);
  const myOpponent = myMatch ? (myMatch.player1.id === user?.id ? myMatch.player2 : myMatch.player1) : null;

  useEffect(() => {
    if (!myOpponent) {
      setH2h(null);
      return;
    }
    api
      .headToHead(myOpponent.id)
      .then(setH2h)
      .catch(() => setH2h(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myOpponent?.id]);

  async function handleReportScore(sets) {
    if (!myMatch) return;
    setBusy(true);
    setError("");
    try {
      await api.reportScore(leagueId, myMatch.id, sets);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemind(matchId) {
    try {
      await api.sendMatchReminder(leagueId, matchId);
      setReminded((prev) => ({ ...prev, [matchId]: true }));
    } catch {
      // best-effort nudge
    }
  }

  if (!league) {
    return (
      <div>
        <SkeletonPageHeader />
        <SkeletonHeroStat />
      </div>
    );
  }

  const played = roundMatches.filter((m) => m.status !== "pending");
  const notPlayed = roundMatches.filter((m) => m.status === "pending");
  const dueDateObj = roundDueDateObj(league.schedule_started_at, roundNumber);
  const dueDate = dueDateObj ? formatDayMonth(dueDateObj) : "";
  const daysRemaining = dueDateObj
    ? Math.max(0, Math.ceil((dueDateObj - new Date()) / 86400000))
    : null;

  return (
    <div>
      <header className="page-head">
        <Link to={`/leagues/${leagueId}`} className="back-link">
          <ChevronIcon aria-hidden="true" />
          {league.name}
        </Link>

        <div className="round-title-row">
          <span className="round-title-label">{t("מחזור")}</span>
          <span className="round-title-number">{roundNumber}</span>
        </div>
        {dueDate && (
          <div className="league-detail-meta">
            {t("נסגר ב-{date}", { date: dueDate })}
            {daysRemaining !== null && ` · ${t("עוד {n} ימים", { n: daysRemaining })}`}
          </div>
        )}
      </header>

      {error && <p className="error">{t(error)}</p>}

      <div className="round-progress">
        <div className="round-progress-header">
          <span>{t("התקדמות המחזור")}</span>
          <span className="round-progress-count" dir="ltr">
            <span className="lit">{played.length}</span>
            <span className="dim">/{roundMatches.length}</span>
          </span>
        </div>
        <div className="profile-form-strip">
          {roundMatches.map((m, i) => (
            <span key={i} className={`profile-form-bar${m.status !== "pending" ? " win" : ""}`} />
          ))}
        </div>
      </div>

      {myMatch && myMatch.status === "pending" && myOpponent && (
        <div className="round-my-match">
          <div className="round-my-match-eyebrow">{t("המשחק שלי")}</div>
          <div className="round-my-match-top">
            <Avatar name={myOpponent.name} size={36} />
            <div className="round-my-match-info">
              <div className="round-my-match-name">{t("מול {name}", { name: myOpponent.name })}</div>
              {h2h && (
                <div className="round-my-match-h2h" dir="ltr">
                  H2H {h2h.wins}-{h2h.losses}
                </div>
              )}
            </div>
          </div>
          <SetScoreForm
            player1Name={myMatch.player1.name}
            player2Name={myMatch.player2.name}
            onSubmit={handleReportScore}
            busy={busy}
          />
        </div>
      )}

      {played.length > 0 && (
        <div className="profile-section">
          <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
            <span>
              {t("שוחקו")} ({played.length})
            </span>
          </div>
          <div className="all-matches-list">
            {played.map((match) => {
              const isCompleted = match.status === "completed";
              const p1Won = isCompleted && match.player1_score > match.player2_score;
              return (
                <div className="all-matches-row" key={match.id}>
                  <span className="all-matches-names">
                    <span className={isCompleted ? (p1Won ? "winner" : "loser") : "strong"}>
                      {match.player1.name}
                    </span>{" "}
                    <span className="vs-label">vs</span>{" "}
                    <span className={isCompleted ? (p1Won ? "loser" : "winner") : "strong"}>
                      {match.player2.name}
                    </span>
                  </span>
                  {isCompleted ? (
                    <span className="round-match-score" dir="ltr">
                      {(match.sets || []).map((s) => `${s.player1_games}-${s.player2_games}`).join(" ")}
                    </span>
                  ) : (
                    <span className="pill-pending">{t("ממתין לאישור")}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {notPlayed.length > 0 && (
        <div className="profile-section">
          <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
            <span>
              {t("טרם שוחקו")} ({notPlayed.length})
            </span>
          </div>
          <div className="all-matches-list">
            {notPlayed.map((match) => {
              const isMine = match.player1.id === user?.id || match.player2.id === user?.id;
              return (
                <div className="all-matches-row" key={match.id}>
                  <span className="all-matches-names dim">
                    {match.player1.name} <span className="vs-label">vs</span> {match.player2.name}
                  </span>
                  {isMine ? (
                    <span className="round-tag-mine">{t("אני")}</span>
                  ) : (
                    <button
                      type="button"
                      className="round-remind-btn"
                      onClick={() => handleRemind(match.id)}
                      disabled={reminded[match.id]}
                    >
                      {reminded[match.id] ? t("תזכורת נשלחה") : t("תזכורת")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
