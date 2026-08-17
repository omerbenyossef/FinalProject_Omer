import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import ConfirmScoreSheet from "../ConfirmScoreSheet.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon, UserPlusIcon } from "../Icons.jsx";
import { formatDayMonth, roundDueDateObj } from "../matchUtils.js";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";

const MAX_VISIBLE_NEXT_MATCHES = 3;

function formatMySets(sets) {
  if (!sets || sets.length === 0) return "";
  return sets.map((s) => `${s.player1_games}-${s.player2_games}`).join(" ");
}

function daysLeftLabel(daysLeft) {
  if (daysLeft >= 0) return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
  const over = Math.abs(daysLeft);
  return over === 1 ? "1 day over" : `${over} days over`;
}

function playersLabel(n, t) {
  return n === 1 ? t("שחקן אחד") : `${n} ${t("שחקנים")}`;
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
  const [confirmEntry, setConfirmEntry] = useState(null);
  const [reportingMatchId, setReportingMatchId] = useState(null);
  const [showAllNextMatches, setShowAllNextMatches] = useState(false);
  const [myRatings, setMyRatings] = useState([]);
  const [friendlyRequireConfirm, setFriendlyRequireConfirm] = useState(true);

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
    api
      .myRatings()
      .then(setMyRatings)
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

  async function handleReportScore(entry, matchId, sets) {
    setBusy(true);
    try {
      if (entry.kind === "friendly") {
        await api.reportFriendlyScore(matchId, sets, friendlyRequireConfirm);
      } else {
        await api.reportScore(entry.league_id, matchId, sets);
      }
      setReportingMatchId(null);
      loadNextMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmScore() {
    if (!confirmEntry) return;
    setBusy(true);
    try {
      if (confirmEntry.kind === "friendly") {
        await api.confirmFriendlyScore(confirmEntry.match.id);
      } else {
        await api.confirmScore(confirmEntry.league_id, confirmEntry.match.id);
      }
      setConfirmEntry(null);
      loadNextMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisputeScore(sets) {
    if (!confirmEntry) return;
    setBusy(true);
    try {
      if (confirmEntry.kind === "friendly") {
        await api.reportFriendlyScore(confirmEntry.match.id, sets, confirmEntry.match.requires_confirmation);
      } else {
        await api.reportScore(confirmEntry.league_id, confirmEntry.match.id, sets);
      }
      setConfirmEntry(null);
      loadNextMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptInvite(matchId) {
    setBusy(true);
    try {
      await api.acceptFriendlyInvite(matchId);
      loadNextMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeclineInvite(matchId) {
    setBusy(true);
    try {
      await api.declineFriendlyInvite(matchId);
      loadNextMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemindFriendly(matchId) {
    try {
      await api.remindFriendly(matchId);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) return null;

  const myLeaguesForSport = myLeagues.filter((l) => l.sport.id === selectedSportId);
  const roundLengthById = new Map(myLeagues.map((l) => [l.id, l.round_length_days]));
  const relevantEntries = nextMatches.filter((entry) => entry.sport_id === selectedSportId);
  const confirmationEntries = relevantEntries.filter(
    (entry) => entry.match.status === "pending_confirmation" && entry.match.reported_by !== user.id
  );
  const leagueMatchesForSport = relevantEntries.filter(
    (entry) => entry.kind !== "friendly" && entry.match.status === "pending"
  );
  const friendlyMatchesForSport = relevantEntries.filter(
    (entry) => entry.kind === "friendly" && entry.match.status === "pending"
  );
  const combinedToPlay = [...leagueMatchesForSport, ...friendlyMatchesForSport];
  const visibleNextMatches = showAllNextMatches
    ? combinedToPlay
    : combinedToPlay.slice(0, MAX_VISIBLE_NEXT_MATCHES);
  const hiddenNextMatchesCount = combinedToPlay.length - visibleNextMatches.length;

  const winRate =
    stats && stats.matches_played > 0 ? Math.round((stats.wins / stats.matches_played) * 100) : null;
  const recentResults = stats ? stats.recent_matches.slice(0, 3) : [];
  const myLeaguesPreview = myLeaguesForSport.slice(0, 2);
  const myRating = myRatings.find((r) => r.sport_id === selectedSportId) || null;

  function daysLeftFor(entry) {
    const roundLengthDays = roundLengthById.get(entry.league_id) ?? 7;
    const due = roundDueDateObj(entry.schedule_started_at, entry.match.round_number, roundLengthDays);
    if (!due) return null;
    return Math.ceil((due.getTime() - Date.now()) / 86400000);
  }

  return (
    <div>
      <header className="home-head">
        <div className="home-head-top">
          <h1 className="home-name">{user.name}</h1>
          <PageHelp
            pageKey="profile"
            title="עמוד הבית"
            text="כאן תראו את המשחק שצריך לשחק או לאשר השבוע, את הליגות שאתם חברים בהן, ואת התוצאות האחרונות שלכם."
          />
        </div>
        <div className="home-summary">
          {t("{n} ליגות", { n: myLeaguesForSport.length })}
          {stats && (
            <>
              {" · "}
              <span className="num" dir="ltr">
                {stats.wins}W-{stats.losses}L
              </span>{" "}
              {t("העונה")}
            </>
          )}
          {winRate !== null && (
            <>
              {" · "}
              <span className="num" dir="ltr">
                {winRate}%
              </span>
            </>
          )}
          {" · "}
          <span dir="ltr">
            {myRating ? `NTRP ${myRating.level.toFixed(1)}${myRating.provisional ? ` (${t("זמני")})` : ""}` : t("לא מדורג")}
          </span>
        </div>
      </header>

      {error && <p className="error">{t(error)}</p>}

      {confirmationEntries.length > 0 &&
        confirmationEntries.map((entry) => {
          const m = entry.match;
          const iAmPlayer1 = m.player1.id === user.id;
          const reporter = m.reported_by === m.player1.id ? m.player1 : m.player2;
          const mySets = iAmPlayer1
            ? m.sets
            : m.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));
          return (
            <button
              type="button"
              key={m.id}
              className="home-confirm"
              onClick={() => setConfirmEntry(entry)}
            >
              <span className="home-confirm-dot" aria-hidden="true" />
              <span className="home-confirm-body">
                <span className="home-confirm-title">
                  {t("{name} דיווח", { name: reporter.name })}{" "}
                  <span className="num" dir="ltr">
                    {formatMySets(mySets)}
                  </span>
                </span>
                <span className="home-confirm-sub">
                  {t("לאישור")} ·{" "}
                  {entry.kind === "friendly" ? (
                    <span className="match-tag">FRIENDLY</span>
                  ) : (
                    entry.league_name
                  )}
                </span>
              </span>
              <ChevronIcon className="chevron-icon" aria-hidden="true" />
            </button>
          );
        })}

      <div className="home-section-label">{t("לשחק השבוע")}</div>
      {matchesLoading ? (
        <ul className="match-list">
          <SkeletonMatchRow />
        </ul>
      ) : combinedToPlay.length === 0 ? (
        <p className="muted" style={{ maxWidth: "30ch" }}>
          {t(
            "עדיין לא שובצו משחקים. מנהל הליגה קובע את לוח המשחקים, וברגע שהוא קיים המשחק שלך יופיע כאן."
          )}
        </p>
      ) : (
        <>
          {visibleNextMatches.map((entry) => {
            const opponent = entry.match.player1.id === user.id ? entry.match.player2 : entry.match.player1;
            const isReporting = reportingMatchId === entry.match.id;

            if (entry.kind === "friendly") {
              const isInviter = entry.match.player1.id === user.id;
              const pending = entry.match.invite_status === "pending";
              return (
                <div key={entry.match.id}>
                  <div className={`home-match${pending ? " friendly-pending" : ""}`}>
                    <Avatar name={opponent.name} size={38} dim={pending} />
                    <div className="home-match-body">
                      <div className="my-match-name">
                        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                          {opponent.name}
                        </span>
                      </div>
                      <div className="home-match-tag-row">
                        <span className="match-tag">FRIENDLY</span>
                        <span className="home-match-league">
                          {pending ? t("הוזמן · ממתין לתשובה") : t("אושר")}
                        </span>
                      </div>
                    </div>
                    {!pending && !isReporting && (
                      <button
                        type="button"
                        className="my-match-report"
                        onClick={() => {
                          setReportingMatchId(entry.match.id);
                          setFriendlyRequireConfirm(true);
                        }}
                      >
                        <span className="my-match-dot" aria-hidden="true" />
                        {t("דווח")}
                      </button>
                    )}
                    {pending && isInviter && (
                      <button
                        type="button"
                        className="friendly-remind"
                        onClick={() => handleRemindFriendly(entry.match.id)}
                      >
                        {t("תזכורת")}
                      </button>
                    )}
                    {pending && !isInviter && (
                      <div className="friendly-invite-actions">
                        <button type="button" onClick={() => handleAcceptInvite(entry.match.id)}>
                          {t("אשר הזמנה")}
                        </button>
                        <button
                          type="button"
                          className="decline"
                          onClick={() => handleDeclineInvite(entry.match.id)}
                        >
                          {t("דחה הזמנה")}
                        </button>
                      </div>
                    )}
                  </div>
                  {isReporting && (
                    <SetScoreForm
                      player1Name={entry.match.player1.name}
                      player2Name={entry.match.player2.name}
                      busy={busy}
                      maxSets={3}
                      onSubmit={(sets) => handleReportScore(entry, entry.match.id, sets)}
                      onCancel={() => setReportingMatchId(null)}
                      friendlyConfirm={{
                        opponentName: opponent.name,
                        checked: friendlyRequireConfirm,
                        onChange: setFriendlyRequireConfirm,
                      }}
                    />
                  )}
                </div>
              );
            }

            const daysLeft = daysLeftFor(entry);
            return (
              <div key={entry.match.id}>
                <div className="home-match">
                  <Avatar name={opponent.name} size={38} />
                  <div className="home-match-body">
                    <div className="my-match-name">
                      <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                        {opponent.name}
                      </span>
                    </div>
                    <div className="home-match-meta">
                      <span className="home-match-league">
                        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                          {entry.league_name}
                        </span>
                      </span>
                      <span className="home-match-nums" dir="ltr">
                        · round {entry.match.round_number}
                        {daysLeft !== null && (
                          <>
                            {" · "}
                            <span style={daysLeft < 0 ? { color: "#f0c26a" } : undefined}>
                              {daysLeftLabel(daysLeft)}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  {!isReporting && (
                    <button
                      type="button"
                      className="my-match-report"
                      onClick={() => setReportingMatchId(entry.match.id)}
                    >
                      <span className="my-match-dot" aria-hidden="true" />
                      {t("דווח")}
                    </button>
                  )}
                </div>
                {isReporting && (
                  <SetScoreForm
                    player1Name={entry.match.player1.name}
                    player2Name={entry.match.player2.name}
                    busy={busy}
                    maxSets={entry.best_of}
                    onSubmit={(sets) => handleReportScore(entry, entry.match.id, sets)}
                    onCancel={() => setReportingMatchId(null)}
                  />
                )}
              </div>
            );
          })}
          {hiddenNextMatchesCount > 0 && (
            <button
              type="button"
              className="link-btn home-more-matches"
              onClick={() => setShowAllNextMatches(true)}
            >
              {t("עוד {n}", { n: hiddenNextMatchesCount })}
            </button>
          )}
        </>
      )}

      <div className="home-section-head">
        <span className="home-section-title">{t("הליגות שלי")}</span>
        {myLeaguesForSport.length > myLeaguesPreview.length ? (
          <Link to="/leagues" className="profile-section-header-link">
            {t("כל ה-{n}", { n: myLeaguesForSport.length })}
          </Link>
        ) : (
          <span>{t("דירוג")}</span>
        )}
      </div>
      <div className="rank-row-list home-league-list">
        {myLeaguesPreview.map((league) => {
          const wins = league.my_wins ?? 0;
          const losses = league.my_losses ?? 0;
          const members = league.my_members_total ?? 0;
          return (
            <Link to={`/leagues/${league.id}`} key={league.id} className="league-row">
              <div className="league-row-body">
                <div className="league-row-name">
                  <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                    {league.name}
                  </span>
                </div>
                <div className="home-league-row-sub" dir="ltr">
                  {wins + losses > 0 ? (
                    <>
                      <span className="mono-num">
                        {wins}W-{losses}L
                      </span>{" "}
                      · {playersLabel(members, t)}
                    </>
                  ) : members <= 1 ? (
                    <>
                      {playersLabel(members, t)} · {t("ממתין לשחקנים")}
                    </>
                  ) : (
                    <>
                      {playersLabel(members, t)} · {t("עדיין אין משחקים")}
                    </>
                  )}
                </div>
              </div>
              <ChevronIcon className="league-row-chevron chevron-icon" aria-hidden="true" />
            </Link>
          );
        })}
        {myLeaguesForSport.length === 0 && (
          <div className="home-empty-leagues">
            <p className="muted">{t("עדיין לא הצטרפת לאף ליגה בענף הזה.")}</p>
            <div className="home-empty-leagues-actions">
              <Link to="/leagues" className="my-match-report">
                <span className="my-match-dot" aria-hidden="true" />
                <UserPlusIcon aria-hidden="true" />
                {t("הזמן שחקנים")}
              </Link>
              <Link to="/leagues" className="link-btn">
                {t("עיין בליגות פתוחות")} ›
              </Link>
            </div>
          </div>
        )}
      </div>

      {stats && recentResults.length > 0 && (
        <>
          <div className="home-section-head">
            <span className="home-section-title-archive">{t("תוצאות אחרונות")}</span>
          </div>
          <div className="home-results-list">
            {recentResults.map((m, i) => (
              <Link to={`/head-to-head/${m.opponent_id}`} className="home-result" key={i}>
                <span className="home-result-who">
                  <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                    {m.opponent_name}
                  </span>
                  {m.kind === "friendly" ? (
                    <>
                      {" "}
                      <span className="match-tag archive">FRIENDLY</span>
                    </>
                  ) : (
                    m.league_name && (
                      <>
                        {" · "}
                        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                          {m.league_name}
                        </span>
                      </>
                    )
                  )}
                  {m.played_at && <> · {formatDayMonth(new Date(m.played_at))}</>}
                </span>
                <span className="home-result-score" dir="ltr">
                  {formatMySets(m.my_sets)}
                </span>
                <span className={`home-result-badge${m.won ? " win" : ""}`}>{m.won ? "W" : "L"}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {confirmEntry && (
        <ConfirmScoreSheet
          match={confirmEntry.match}
          currentUserId={user.id}
          busy={busy}
          maxSets={confirmEntry.best_of}
          onConfirm={handleConfirmScore}
          onDispute={handleDisputeScore}
          onClose={() => setConfirmEntry(null)}
        />
      )}
    </div>
  );
}
