import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import ScheduleForm from "../ScheduleForm.jsx";
import ConfirmScoreSheet from "../ConfirmScoreSheet.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon, UserPlusIcon } from "../Icons.jsx";
import {
  formatDayMonthTime,
  roundDueDateObj,
  matchScheduleState,
  daysLeftLabel,
  NTRP_STEPS,
} from "../matchUtils.js";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";

const MAX_VISIBLE_NEXT_MATCHES = 3;

function formatMySets(sets) {
  if (!sets || sets.length === 0) return "";
  return sets.map((s) => `${s.player1_games}-${s.player2_games}`).join(" ");
}

function playersLabel(n, t) {
  return n === 1 ? t("שחקן אחד") : `${n} ${t("שחקנים")}`;
}

export default function Profile() {
  const { user } = useAuth();
  const { selectedSportId, sports } = useSport();
  const { t } = useLanguage();
  const { nextMatches, matchesLoading, reload: loadNextMatches, openAction } = useOpenAction();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [myLeagues, setMyLeagues] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmEntry, setConfirmEntry] = useState(null);
  const [reportingMatchId, setReportingMatchId] = useState(null);
  const [showAllNextMatches, setShowAllNextMatches] = useState(false);
  const [myRatings, setMyRatings] = useState([]);
  const [friendlyRequireConfirm, setFriendlyRequireConfirm] = useState(true);
  const [schedulingMatchId, setSchedulingMatchId] = useState(null);

  useEffect(() => {
    api
      .myLeagues()
      .then(setMyLeagues)
      .catch(() => {});
    api
      .myRatings()
      .then(setMyRatings)
      .catch(() => {});
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

  async function handleProposeSchedule(leagueId, matchId, scheduledAt) {
    setBusy(true);
    try {
      await api.proposeSchedule(leagueId, matchId, scheduledAt);
      setSchedulingMatchId(null);
      loadNextMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSchedule(leagueId, matchId) {
    setBusy(true);
    try {
      await api.confirmSchedule(leagueId, matchId);
      loadNextMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  const myLeaguesForSport = myLeagues.filter((l) => l.sport.id === selectedSportId);
  const roundLengthById = new Map(myLeagues.map((l) => [l.id, l.round_length_days]));
  const barMatchId = openAction?.match.id ?? null;
  const relevantEntries = nextMatches
    .filter((entry) => entry.sport_id === selectedSportId)
    .filter((entry) => entry.match.id !== barMatchId);
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
  const myLeaguesPreview = myLeaguesForSport.slice(0, 2);
  const myRating = myRatings.find((r) => r.sport_id === selectedSportId) || null;
  const sportName = sports.find((s) => s.id === selectedSportId)?.name;

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
        <div className="home-stats" dir="ltr">
          <span className="home-stat">
            {winRate !== null ? winRate : "–"}% <span className="home-stat-unit">{t("ניצחונות")}</span>
          </span>
          <span className="home-stat">
            {stats ? stats.wins : 0}W-{stats ? stats.losses : 0}L
          </span>
          <span className="home-stat">{t("{n} ליגות", { n: myLeaguesForSport.length })}</span>
        </div>

        {myRating ? (
          <div className="home-rating">
            <div className="home-rating-head">
              <span className="home-rating-label">
                NTRP · {sportName ? t(sportName) : ""}
              </span>
              <span className="home-rating-level" dir="ltr">
                {myRating.level.toFixed(1)}
              </span>
            </div>
            <div className="home-rating-scale" dir="ltr" aria-hidden="true">
              {NTRP_STEPS.map((step) => (
                <span
                  key={step}
                  className={`home-rating-step${step === myRating.level ? " here" : ""}`}
                />
              ))}
            </div>
            <div className="home-rating-foot" dir="ltr">
              <span>1.5</span>
              <span>
                {myRating.provisional
                  ? t("זמני · עוד {n} משחקים", { n: 3 - myRating.rated_matches })
                  : ""}
              </span>
              <span>7.0</span>
            </div>
          </div>
        ) : (
          <Link to="/leagues" className="home-rating-empty">
            {t("לא מדורג")} · {t("קבע רמה")}
          </Link>
        )}
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
                    <Avatar name={opponent.name} size={36} dim={pending} />
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
            const scheduleState = matchScheduleState(entry.match, user.id);
            const isScheduling = schedulingMatchId === entry.match.id;
            const scheduledText = entry.match.scheduled_at
              ? formatDayMonthTime(new Date(entry.match.scheduled_at))
              : "";
            return (
              <div key={entry.match.id}>
                <div className="home-match">
                  <Avatar name={opponent.name} size={36} />
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
                        {scheduleState === "proposed_by_me" && <> · {t("ממתין לאישור שעה")}</>}
                        {scheduleState === "proposed_by_them" && (
                          <> · {t("הוצע זמן: {datetime}", { datetime: scheduledText })}</>
                        )}
                        {scheduleState === "confirmed_future" && (
                          <> · {t("מתוזמן ל-{datetime}", { datetime: scheduledText })}</>
                        )}
                        {(scheduleState === "unscheduled" || scheduleState === "ready") && (
                          <>
                            · round {entry.match.round_number}
                            {daysLeft !== null && (
                              <>
                                {" · "}
                                <span style={daysLeft < 0 ? { color: "#f0c26a" } : undefined}>
                                  {daysLeftLabel(daysLeft)}
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  {scheduleState === "unscheduled" && (
                    <button
                      type="button"
                      className="my-match-report"
                      onClick={() => setSchedulingMatchId(entry.match.id)}
                    >
                      <span className="my-match-dot" aria-hidden="true" />
                      {t("קבע שעה")}
                    </button>
                  )}
                  {scheduleState === "proposed_by_them" && (
                    <div className="friendly-invite-actions">
                      <button
                        type="button"
                        onClick={() => handleConfirmSchedule(entry.league_id, entry.match.id)}
                        disabled={busy}
                      >
                        {t("אשר שעה")}
                      </button>
                      <button
                        type="button"
                        className="decline"
                        onClick={() => setSchedulingMatchId(entry.match.id)}
                      >
                        {t("הצע שעה אחרת")}
                      </button>
                    </div>
                  )}
                  {scheduleState === "ready" && !isReporting && (
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
                {isScheduling && (
                  <ScheduleForm
                    busy={busy}
                    onSubmit={(scheduledAt) =>
                      handleProposeSchedule(entry.league_id, entry.match.id, scheduledAt)
                    }
                    onCancel={() => setSchedulingMatchId(null)}
                  />
                )}
                {isReporting && scheduleState === "ready" && (
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
                      {league.my_rank != null && (
                        <>
                          {" "}
                          · <span className="mono-num">#{league.my_rank}</span>
                        </>
                      )}
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
