import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import Avatar from "../Avatar.jsx";
import { BellIcon, ChevronIcon } from "../Icons.jsx";
import {
  roundDueDateObj,
  matchScheduleState,
  NTRP_STEPS,
  activeRoundStatus,
  currentRoundNumber,
  daysUntil,
  weekdayShort,
  formatWeekdayDateTime,
} from "../matchUtils.js";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";
import EmptyLine from "../EmptyLine.jsx";
import RatingQuestionnaire from "../RatingQuestionnaire.jsx";

const TP_CARD_WIDTH = 305;
const TP_CARD_GAP = 12;

// Card sort/action priority for the "to play this week" carousel — first
// whatever depends on me (in this order), then whatever's waiting on the
// other player. See toplaycarousel104c.md section 3.
const TP_PRIORITY = {
  "accept-invite": 0,
  schedule: 1,
  "confirm-time": 2,
  "confirm-score": 3,
  report: 4,
  "remind-them": 5,
};

function toPlayCardKind(entry, userId) {
  const m = entry.match;
  const pendingInvite = entry.kind === "friendly" && m.invite_status === "pending";
  if (pendingInvite) {
    return m.player1.id === userId
      ? { kind: "remind-them", dependsOnMe: false }
      : { kind: "accept-invite", dependsOnMe: true };
  }
  if (m.status === "pending_confirmation") {
    return m.reported_by === userId
      ? { kind: "remind-them", dependsOnMe: false }
      : { kind: "confirm-score", dependsOnMe: true };
  }
  const scheduleState = matchScheduleState(m, userId);
  if (scheduleState === "unscheduled") return { kind: "schedule", dependsOnMe: true };
  if (scheduleState === "proposed_by_them") return { kind: "confirm-time", dependsOnMe: true };
  if (scheduleState === "proposed_by_me") return { kind: "remind-them", dependsOnMe: false };
  if (scheduleState === "ready") return { kind: "report", dependsOnMe: true };
  return { kind: "waiting", dependsOnMe: false };
}

function dueDateFor(entry, roundLengthById) {
  if (entry.kind === "friendly" || !entry.match.round_number) return null;
  const roundLengthDays = roundLengthById.get(entry.league_id) ?? 7;
  const due = roundDueDateObj(entry.schedule_started_at, entry.match.round_number, roundLengthDays);
  return due ? due.getTime() : null;
}

function sortToPlay(entries, userId, roundLengthById) {
  return [...entries].sort((a, b) => {
    const ka = toPlayCardKind(a, userId);
    const kb = toPlayCardKind(b, userId);
    if (ka.dependsOnMe !== kb.dependsOnMe) return ka.dependsOnMe ? -1 : 1;
    const pa = TP_PRIORITY[ka.kind] ?? 6;
    const pb = TP_PRIORITY[kb.kind] ?? 6;
    if (pa !== pb) return pa - pb;
    const dueA = dueDateFor(a, roundLengthById);
    const dueB = dueDateFor(b, roundLengthById);
    if (dueA === null && dueB === null) return 0;
    if (dueA === null) return 1;
    if (dueB === null) return -1;
    return dueA - dueB;
  });
}

function formatMySets(sets) {
  if (!sets || sets.length === 0) return "";
  return sets.map((s) => `${s.player1_games}-${s.player2_games}`).join(" ");
}

function ToPlayCard({
  entry,
  userId,
  t,
  myNtrp,
  oppNtrp,
  h2h,
  busy,
  isReporting,
  onStartReport,
  onStartSchedule,
  onCancelForm,
  onSubmitScore,
  onOpenProposal,
  onOpenConfirmScore,
  onAccept,
  onDecline,
  onRemind,
  friendlyRequireConfirm,
  setFriendlyRequireConfirm,
  single,
}) {
  const m = entry.match;
  const isFriendly = entry.kind === "friendly";
  const opponent = m.player1.id === userId ? m.player2 : m.player1;
  const pendingInvite = isFriendly && m.invite_status === "pending";
  const isInviter = isFriendly && m.player1.id === userId;
  const needsMyConfirm = m.status === "pending_confirmation" && m.reported_by !== userId;
  const awaitingOpponentConfirm = m.status === "pending_confirmation" && m.reported_by === userId;
  const scheduleState =
    pendingInvite || needsMyConfirm || awaitingOpponentConfirm ? null : matchScheduleState(m, userId);

  // hometoplaycardfix.md — the card is a full NTRP/HEAD TO HEAD/TIME table
  // (quick scanning across the carousel), not a single compact meta line.
  const leagueLine = isFriendly ? (
    `FRIENDLY · ${pendingInvite ? "INVITED" : "ACCEPTED"}`
  ) : (
    <>
      R{m.round_number} ·{" "}
      <span dir="auto" style={{ unicodeBidi: "isolate" }}>
        {(entry.league_name || "").toUpperCase()}
      </span>
    </>
  );
  const myNtrpText = myNtrp != null ? myNtrp.toFixed(1) : "—";
  const oppNtrpText = oppNtrp != null ? oppNtrp.toFixed(1) : "—";
  const h2hText = `${h2h?.wins ?? 0}-${h2h?.losses ?? 0}`;
  const timeText = m.scheduled_at ? formatWeekdayDateTime(new Date(m.scheduled_at)) : "not set";
  // Once a match has been reported the scheduled time is beside the point, and
  // leaving it there reads as "you still have to play this". Say what is
  // actually pending instead.
  const notPlayedClaim = m.void_reason === "not_played" && m.corrected_sets == null;
  let statusText = null;
  if (needsMyConfirm) {
    statusText = notPlayedClaim ? t("מחכה לתשובה שלך") : t("התוצאה מחכה לאישור שלך");
  } else if (awaitingOpponentConfirm) {
    statusText = notPlayedClaim
      ? t("ממתין לאישור שהמשחק לא בוצע")
      : t("ממתין לאישור התוצאה");
  }

  let action = null;
  if (needsMyConfirm) {
    // A "didn't happen" claim has no score to confirm, and the label
    // shouldn't presume the answer either way.
    action = {
      title: notPlayedClaim ? t("השב לדיווח") : t("אשר תוצאה"),
      onPress: onOpenConfirmScore,
    };
  } else if (awaitingOpponentConfirm) {
    action = { title: t("תזכורת"), onPress: onRemind };
  } else if (pendingInvite) {
    if (isInviter) action = { title: t("תזכורת"), onPress: onRemind };
  } else if (scheduleState === "unscheduled") {
    action = { title: t("קבע שעה"), onPress: onStartSchedule };
  } else if (scheduleState === "proposed_by_them") {
    action = { title: t("אשר את השעה"), onPress: onOpenProposal };
  } else if (scheduleState === "proposed_by_me") {
    action = { title: t("תזכורת"), onPress: onRemind };
  } else if (scheduleState === "ready") {
    action = { title: t("דווח תוצאה"), onPress: onStartReport };
  }

  if (isReporting && scheduleState === "ready") {
    return (
      <div className={`tp-card${single ? " single" : ""}`}>
        <SetScoreForm
          player1Name={m.player1.name}
          player2Name={m.player2.name}
          busy={busy}
          maxSets={isFriendly ? 3 : entry.best_of}
          onSubmit={onSubmitScore}
          onCancel={onCancelForm}
          friendlyConfirm={
            isFriendly
              ? {
                  opponentName: opponent.name,
                  checked: friendlyRequireConfirm,
                  onChange: setFriendlyRequireConfirm,
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className={`tp-card${single ? " single" : ""}`}>
      <div className="tp-card-top">
        <Avatar
          name={opponent.name}
          size={52}
          dim={pendingInvite}
          background="#232a35"
          color="#c9cfdb"
          fontFamily="'IBM Plex Mono', monospace"
          fontSize={17}
        />
        <div className="tp-id">
          <Link to={`/players/${opponent.id}`} className="tp-name">
            <span dir="auto" style={{ unicodeBidi: "isolate" }}>
              {opponent.name}
            </span>
          </Link>
          <div className="tp-league-line" dir="ltr">
            {leagueLine}
          </div>
        </div>
      </div>

      <div className="tp-table" dir="ltr">
        <div className="tp-row">
          <span className="tp-row-label">NTRP</span>
          <span className="tp-row-value">
            {myNtrpText} · {oppNtrpText}
          </span>
        </div>
        <div className="tp-row">
          <span className="tp-row-label">HEAD TO HEAD</span>
          <span className="tp-row-value">{h2hText}</span>
        </div>
        <div className="tp-row">
          <span className="tp-row-label">{statusText ? "STATUS" : "TIME"}</span>
          <span className="tp-row-value" dir={statusText ? "auto" : undefined}>
            {statusText || timeText}
          </span>
        </div>
      </div>

      {pendingInvite && !isInviter ? (
        <div className="tp-invite-actions friendly-invite-actions">
          <button type="button" onClick={onAccept} disabled={busy}>
            {t("אשר הזמנה")}
          </button>
          <button type="button" className="decline" onClick={onDecline} disabled={busy}>
            {t("דחה הזמנה")}
          </button>
        </div>
      ) : (
        action && (
          <button type="button" className="tp-action" onClick={action.onPress} disabled={busy}>
            <span className="tp-dot-lime" aria-hidden="true" />
            <span className="tp-action-label">{action.title}</span>
            <ChevronIcon aria-hidden="true" />
          </button>
        )
      )}
    </div>
  );
}

// 151c — a player with no league yet: one question, three choices, no
// explanatory copy and no recommended path. Replaces 109a's two asymmetric
// options. Direction is inherited from <html dir>, which LanguageContext
// keeps in step with the active language — never hardcoded here.
function NoLeagueBlock({ t, navigate, openCount, showLevelRow, onSetLevel }) {
  return (
    <div className="nl">
      <h1 className="nl-q">{t("איך תרצה להתחיל?")}</h1>

      <div className="nl-opts">
        <button type="button" className="nl-opt" onClick={() => navigate("/leagues/open")}>
          <span className="nl-opt-label">{t("הצטרף לליגה ציבורית")}</span>
          {openCount > 0 ? (
            <span className="nl-opt-count" dir="ltr">
              {openCount} OPEN
            </span>
          ) : (
            <ChevronIcon className="nl-opt-chev" aria-hidden="true" />
          )}
        </button>

        <button type="button" className="nl-opt" onClick={() => navigate("/leagues?create=1")}>
          <span className="nl-opt-label">{t("פתח ליגה משלך")}</span>
          <ChevronIcon className="nl-opt-chev" aria-hidden="true" />
        </button>

        <button type="button" className="nl-opt" onClick={() => navigate("/friendly/new")}>
          <span className="nl-opt-label nl-opt-label--quiet">{t("משחק ידידותי בלי ליגה")}</span>
          <ChevronIcon className="nl-opt-chev" aria-hidden="true" />
        </button>
      </div>

      {showLevelRow && (
        <div className="nl-foot">
          <span>{t("הרמה שלך עוד לא נקבעה")}</span>
          <button type="button" className="nl-foot-cta" onClick={onSetLevel}>
            {t("קבע רמה")}
          </button>
        </div>
      )}
    </div>
  );
}

// 109b — exactly one league, its schedule hasn't been generated yet ("round
// not opened"). Replaces the usual to-play/my-leagues body with a single
// hero for that one league. See firstdayandemptystates109.md section 2.
function SoloLeagueHero({ league, members, standings, t }) {
  const daysLeft = daysUntil(league.starts_at ? new Date(league.starts_at) : null);
  const joined = league.member_count ?? members.length;
  const capacity = league.capacity ?? null;
  const levelByUser = new Map((standings || []).map((r) => [r.user.id, r.level]));

  const openLine = [
    league.starts_at ? `R1 OPENS ${weekdayShort(new Date(league.starts_at))}` : null,
    capacity != null ? `${joined} OF ${capacity} JOINED` : `${joined} JOINED`,
  ]
    .filter(Boolean)
    .join(" · ");

  const shown = members.slice(0, 5);
  const extra = members.length - shown.length;

  return (
    <div className="home-solo">
      {daysLeft != null && (
        <div className="home-solo-countdown" dir="rtl">
          <span className="home-solo-label">{t("STARTS IN")}</span>
          <div className="home-solo-hero">
            <span className="home-solo-num">{daysLeft}</span>
            <span className="home-solo-word">{daysLeft === 1 ? t("יום") : t("ימים")}</span>
          </div>
        </div>
      )}

      <h2 className="home-solo-name" dir="rtl">
        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
          {league.name}
        </span>
      </h2>
      <p className="home-solo-meta" dir="ltr">
        {openLine}
      </p>

      <div className="home-solo-who">
        <div className="home-solo-who-label">{t("WHO IS IN")}</div>
        {shown.map((m) => (
          <div className="home-solo-who-row" key={m.id}>
            <span className="home-solo-who-name">
              <span dir="auto" style={{ unicodeBidi: "isolate" }}>{m.name}</span>
            </span>
            {levelByUser.get(m.id) != null && (
              <span className="home-solo-who-ntrp" dir="ltr">
                NTRP {levelByUser.get(m.id).toFixed(1)}
              </span>
            )}
          </div>
        ))}
        {extra > 0 && <div className="home-solo-who-more">+{extra} MORE</div>}
      </div>

      <Link to={`/leagues/${league.id}/manage`} className="home-solo-invite">
        {t("הזמן חבר לליגה")}
        <ChevronIcon aria-hidden="true" />
      </Link>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const { selectedSportId, sports } = useSport();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { nextMatches, matchesLoading, reload: loadNextMatches, openAction, itemCount } =
    useOpenAction();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  // The bell counts what needs doing, and it comes from the notifications
  // endpoint itself so the badge and the screen can never disagree.
  const [notifCount, setNotifCount] = useState(0);
  const [myLeagues, setMyLeagues] = useState([]);
  const [busy, setBusy] = useState(false);
  const [reportingMatchId, setReportingMatchId] = useState(null);
  const [myRatings, setMyRatings] = useState([]);
  const [friendlyRequireConfirm, setFriendlyRequireConfirm] = useState(true);
  const [activeToPlay, setActiveToPlay] = useState(0);
  const [standingsByLeague, setStandingsByLeague] = useState({});
  const [h2hByOpponent, setH2hByOpponent] = useState({});
  const [friendlyNtrpByOpponent, setFriendlyNtrpByOpponent] = useState({});
  const [allLeagues, setAllLeagues] = useState([]);
  const [soloMembers, setSoloMembers] = useState([]);
  const [settingLevel, setSettingLevel] = useState(false);
  const carouselRef = useRef(null);
  const requestedLeagueStandingsRef = useRef(new Set());
  const requestedH2hRef = useRef(new Set());
  const requestedFriendlyNtrpRef = useRef(new Set());

  useEffect(() => {
    api
      .myLeagues()
      .then(setMyLeagues)
      .catch(() => {});
    api
      .myRatings()
      .then(setMyRatings)
      .catch(() => {});
    api
      .listLeagues()
      .then(setAllLeagues)
      .catch(() => {});
    api
      .notifications()
      .then((data) => setNotifCount(data.unread_count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setActiveToPlay(0);
  }, [selectedSportId]);

  useEffect(() => {
    if (!selectedSportId) return;
    api
      .myStats(selectedSportId)
      .then(setStats)
      .catch((err) => setError(err.message));
  }, [selectedSportId]);

  // Reporting/confirming a score can finalize a match immediately (friendly
  // matches without confirmation, or the opponent's confirm/dispute action),
  // which moves the NTRP rating server-side right away. myRatings is only
  // fetched once on mount, so refresh it here too or the header keeps
  // showing the pre-match number until the page is reloaded.
  function reloadRatings() {
    api
      .myRatings()
      .then(setMyRatings)
      .catch(() => {});
  }

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
      reloadRatings();
      if (selectedSportId) api.myStats(selectedSportId).then(setStats).catch(() => {});
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

  async function handleRemindLeague(leagueId, matchId) {
    try {
      await api.sendMatchReminder(leagueId, matchId);
    } catch (err) {
      setError(err.message);
    }
  }

  const myLeaguesForSport = myLeagues.filter((l) => l.sport.id === selectedSportId);
  const roundLengthById = new Map(myLeagues.map((l) => [l.id, l.round_length_days]));
  // 109: a brand-new player (no league at all) and a player with exactly one
  // not-yet-scheduled league both get a dedicated hero instead of the usual
  // to-play/my-leagues body — see firstdayandemptystates109.md sections 1-2.
  const isNoLeague = myLeaguesForSport.length === 0;
  const soloLeague = myLeaguesForSport.length === 1 ? myLeaguesForSport[0] : null;
  const isRoundNotOpened = !!soloLeague && !soloLeague.schedule_started_at;
  const openLeagueCount = allLeagues.filter((l) => l.is_open && l.sport.id === selectedSportId).length;

  useEffect(() => {
    if (!isRoundNotOpened) {
      setSoloMembers([]);
      return;
    }
    api
      .listMembers(soloLeague.id)
      .then(setSoloMembers)
      .catch(() => {});
    if (!requestedLeagueStandingsRef.current.has(soloLeague.id)) {
      requestedLeagueStandingsRef.current.add(soloLeague.id);
      api
        .getStandings(soloLeague.id)
        .then((rows) => setStandingsByLeague((prev) => ({ ...prev, [soloLeague.id]: rows })))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRoundNotOpened, soloLeague?.id]);
  const barMatchId = openAction?.match.id ?? null;
  // A friendly match has no page other than this one to act on it, unlike a league
  // match (which still shows fully on its LeagueDetail page even while promoted to
  // the tab bar). So only hide the promoted match here when it's a league match, or
  // a friendly one whose action (confirm) navigates to the dedicated confirm page
  // regardless of which page triggered it — report/schedule friendly actions must
  // stay reachable here.
  const relevantEntries = nextMatches
    .filter((entry) => entry.sport_id === selectedSportId)
    .filter(
      (entry) =>
        entry.match.id !== barMatchId || (entry.kind === "friendly" && openAction?.kind !== "confirm")
    );
  const confirmationEntries = relevantEntries.filter(
    (entry) => entry.match.status === "pending_confirmation" && entry.match.reported_by !== user?.id
  );
  const isToPlayStatus = (status) => status === "pending" || status === "pending_confirmation";
  // A friendly match whose scheduled time is more than a week gone has
  // stopped being "this week" business — it stays fully actionable (report
  // a score, report it wasn't played, get reminded) via NEEDS YOU, just not
  // cluttering this carousel forever. League matches aren't touched here:
  // their staleness already surfaces to the league's admin separately.
  const STALE_FRIENDLY_MS = 7 * 86400000;
  const isStaleFriendly = (entry) =>
    entry.kind === "friendly" &&
    entry.match.scheduled_at != null &&
    Date.now() - new Date(entry.match.scheduled_at).getTime() > STALE_FRIENDLY_MS;
  // A league match whose round has closed is no longer "this week" — reported
  // or not, it moves to the in-progress page (which is where the leftovers
  // live, and the only place a closed-round match can still be answered).
  const roundIsOver = (entry) => {
    const due = dueDateFor(entry, roundLengthById);
    return due != null && due < Date.now();
  };
  const leagueMatchesForSport = relevantEntries.filter(
    (entry) => entry.kind !== "friendly" && isToPlayStatus(entry.match.status) && !roundIsOver(entry)
  );
  const friendlyMatchesForSport = relevantEntries.filter(
    (entry) => entry.kind === "friendly" && isToPlayStatus(entry.match.status) && !isStaleFriendly(entry)
  );
  const combinedToPlay = [...leagueMatchesForSport, ...friendlyMatchesForSport];
  const sortedToPlay = user ? sortToPlay(combinedToPlay, user.id, roundLengthById) : [];
  // 109c: "all matches of the round have been played" — only meaningful when
  // there's an actual next round to name; otherwise this stays silent like
  // it always has (rule 1: no content, no placeholder).
  const nextRoundOpen = (() => {
    if (combinedToPlay.length > 0 || isNoLeague || isRoundNotOpened) return null;
    let best = null;
    for (const l of myLeaguesForSport) {
      const { round, daysLeft } = activeRoundStatus(l.schedule_started_at, l.round_length_days || 7);
      if (round == null || daysLeft == null) continue;
      if (best === null || daysLeft < best.daysLeft) best = { round: round + 1, daysLeft };
    }
    return best;
  })();

  function opponentIdFor(entry) {
    return entry.match.player1.id === user.id ? entry.match.player2.id : entry.match.player1.id;
  }

  useEffect(() => {
    if (!user) return;
    const leagueIds = [...new Set(sortedToPlay.filter((e) => e.kind !== "friendly").map((e) => e.league_id))];
    leagueIds.forEach((id) => {
      if (requestedLeagueStandingsRef.current.has(id)) return;
      requestedLeagueStandingsRef.current.add(id);
      api
        .getStandings(id)
        .then((rows) => setStandingsByLeague((prev) => ({ ...prev, [id]: rows })))
        .catch(() => {});
    });

    const opponentIds = [...new Set(sortedToPlay.map(opponentIdFor))];
    opponentIds.forEach((id) => {
      if (requestedH2hRef.current.has(id)) return;
      requestedH2hRef.current.add(id);
      api
        .headToHead(id)
        .then((data) => setH2hByOpponent((prev) => ({ ...prev, [id]: data })))
        .catch(() => {});
    });

    const friendlyOpponentIds = [
      ...new Set(sortedToPlay.filter((e) => e.kind === "friendly").map(opponentIdFor)),
    ];
    friendlyOpponentIds.forEach((id) => {
      const cacheKey = `${id}:${selectedSportId}`;
      if (requestedFriendlyNtrpRef.current.has(cacheKey)) return;
      requestedFriendlyNtrpRef.current.add(cacheKey);
      api
        .playerProfile(id, selectedSportId)
        .then((data) => setFriendlyNtrpByOpponent((prev) => ({ ...prev, [cacheKey]: data.ntrp ?? null })))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedToPlay.map((e) => e.match.id).join(",")]);

  if (!user) return null;

  const winRate =
    stats && stats.matches_played > 0 ? Math.round((stats.wins / stats.matches_played) * 100) : null;
  const myRating = myRatings.find((r) => r.sport_id === selectedSportId) || null;
  const sportName = sports.find((s) => s.id === selectedSportId)?.name;

  // homeformandratingchart125a.md section 3 — the last 5 completed matches
  // (already sport-filtered, newest-first, from /auth/me/stats) read oldest
  // to newest, W/L only. Friendly matches count; unresolved disputes and
  // cancellations never reach `completed` status so they're excluded already.
  const recentForForm = (stats?.recent_matches ?? []).slice(0, 5);
  const formResults = [...recentForForm].reverse().map((m) => (m.won ? "W" : "L"));
  const paddedFormResults = [...Array(Math.max(0, 5 - formResults.length)).fill(null), ...formResults];
  const formWins = recentForForm.filter((m) => m.won).length;
  const formLosses = recentForForm.length - formWins;
  const hasNoMatches = !!stats && stats.matches_played === 0;

  // homeformstripandleagues126a.md section 3 — "my leagues" is a row list,
  // one row per league (name, meta line, my rank). A league whose round is
  // already active sorts to the top; ties keep myLeagues' own order
  // (already newest-league-first from the server). Cap at 3 rows + "N more".
  const cycleLabelEn = (l) => (l.round_length_days === 14 ? "Bi-weekly cycle" : "Weekly cycle");
  const sortedHomeLeagues = [...myLeaguesForSport].sort((a, b) => {
    const ra = currentRoundNumber(a.schedule_started_at, a.round_length_days || 7) !== null ? 0 : 1;
    const rb = currentRoundNumber(b.schedule_started_at, b.round_length_days || 7) !== null ? 0 : 1;
    return ra - rb;
  });
  const shownHomeLeagues = sortedHomeLeagues.slice(0, 3);
  const extraHomeLeagues = sortedHomeLeagues.length - shownHomeLeagues.length;

  function oppNtrpFor(entry) {
    if (entry.kind === "friendly") {
      return friendlyNtrpByOpponent[`${opponentIdFor(entry)}:${selectedSportId}`] ?? null;
    }
    const rows = standingsByLeague[entry.league_id];
    const row = rows?.find((r) => r.user.id === opponentIdFor(entry));
    return row?.level ?? null;
  }

  function handleCarouselScroll() {
    const el = carouselRef.current;
    if (!el) return;
    const idx = Math.round(Math.abs(el.scrollLeft) / (TP_CARD_WIDTH + TP_CARD_GAP));
    setActiveToPlay((prev) => (prev === idx ? prev : idx));
  }

  return (
    <div className="home-page">
      <header className="home-head">
        <div className="home-head-top">
          <div className="home-name-row">
            <h1 className="home-name">{user.name}</h1>
            {(isNoLeague || isRoundNotOpened) && (
              <span className="home-tag">{isNoLeague ? "DAY 1" : "1 LEAGUE"}</span>
            )}

          </div>
          <div className="home-head-actions">
            <button
              type="button"
              className="home-bell"
              onClick={() => navigate("/notifications")}
              aria-label={t("התראות")}
            >
              <BellIcon aria-hidden="true" />
              {notifCount > 0 && <span className="home-bell-count">{notifCount}</span>}
            </button>
            <PageHelp
              pageKey="profile"
              title="עמוד הבית"
              text="כאן תראו את המשחק שצריך לשחק או לאשר השבוע, את הליגות שאתם חברים בהן, ואת התוצאות האחרונות שלכם."
            />
          </div>
        </div>
        {!isNoLeague && !isRoundNotOpened && (
          <div className="home-stats" dir="ltr">
            <span className="home-stat">
              {winRate !== null ? winRate : "–"}% <span className="home-stat-unit">{t("ניצחונות")}</span>
            </span>
            <span className="home-stat">
              {stats ? stats.wins : 0}W-{stats ? stats.losses : 0}L
            </span>
            <span className="home-stat">{t("{n} ליגות", { n: myLeaguesForSport.length })}</span>
          </div>
        )}

        {myRating ? (
          <div className={`home-rating${isRoundNotOpened ? " compact" : ""}`}>
            <div className="home-rating-head">
              <span className="home-rating-label">
                NTRP · {sportName ? t(sportName) : ""}
              </span>
              <span className="home-rating-level" dir="ltr">
                {myRating.level.toFixed(1)}
              </span>
            </div>
            {!isRoundNotOpened && (
              <>
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
              </>
            )}
          </div>
        ) : (
          // With no league the same message lives in 151c's footer row, so
          // don't say it twice on one screen.
          !isRoundNotOpened &&
          !isNoLeague && (
            <Link to="/leagues" className="home-rating-empty">
              {t("לא מדורג")} · {t("קבע רמה")}
            </Link>
          )
        )}
      </header>

      {error && <p className="error">{t(error)}</p>}

      <div className="home-sheet">
      {isNoLeague ? (
        <NoLeagueBlock
          t={t}
          navigate={navigate}
          openCount={openLeagueCount}
          showLevelRow={!myRating}
          onSetLevel={() => setSettingLevel(true)}
        />
      ) : isRoundNotOpened ? (
        <SoloLeagueHero
          league={soloLeague}
          members={soloMembers}
          standings={standingsByLeague[soloLeague.id]}
          t={t}
        />
      ) : (
        <>
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
              onClick={() => navigate(`/matches/${m.id}/confirm`)}
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

      {stats &&
        !isNoLeague &&
        (hasNoMatches ? (
          <div className="home-empty-rating">
            <div className="home-empty-rating-line" dir="ltr">
              NTRP {myRating ? myRating.level.toFixed(1) : "—"} · {t("PROVISIONAL")}
            </div>
            <div className="home-empty-rating-sub">
              {t("עוד {n} משחקים והדירוג נקבע", {
                n: myRating ? Math.max(0, 3 - myRating.rated_matches) : 3,
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="home-form">
              <div className="home-form-head" dir="ltr">
                <span className="home-form-label">{t("FORM · LAST 5")}</span>
                <span className="home-form-record">
                  {formWins}W-{formLosses}L
                </span>
              </div>
              <div className="home-form-row" dir="ltr">
                {paddedFormResults.map((r, i) => (
                  <span key={i} className={`home-form-cell${r === "W" ? " win" : ""}`}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </>
        ))}

      {(matchesLoading || combinedToPlay.length > 0) && (
        <div className="tp-head">
          <h2 className="tp-title">{t("לשחק השבוע")}</h2>
          {!matchesLoading && sortedToPlay.length > 1 && (
            <span className="tp-count" dir="ltr">
              {activeToPlay + 1} / {sortedToPlay.length}
            </span>
          )}
        </div>
      )}
      {matchesLoading ? (
        <ul className="match-list">
          <SkeletonMatchRow />
        </ul>
      ) : combinedToPlay.length === 0 ? (
        nextRoundOpen && (
          <EmptyLine
            sentence={t("כל המשחקים של המחזור שוחקו.")}
            meta={`R${nextRoundOpen.round} OPENS IN ${nextRoundOpen.daysLeft} DAY${
              nextRoundOpen.daysLeft === 1 ? "" : "S"
            }`}
          />
        )
      ) : (
        combinedToPlay.length > 0 && (
          <>
            <div
              className={`tp-carousel${sortedToPlay.length === 1 ? " single" : ""}`}
              ref={carouselRef}
              onScroll={handleCarouselScroll}
            >
              {sortedToPlay.map((entry) => (
                <ToPlayCard
                  key={entry.match.id}
                  entry={entry}
                  userId={user.id}
                  t={t}
                  myNtrp={myRating?.level ?? null}
                  oppNtrp={oppNtrpFor(entry)}
                  h2h={h2hByOpponent[opponentIdFor(entry)]}
                  busy={busy}
                  isReporting={reportingMatchId === entry.match.id}
                  single={sortedToPlay.length === 1}
                  onStartReport={() => {
                    setReportingMatchId(entry.match.id);
                    setFriendlyRequireConfirm(true);
                  }}
                  onStartSchedule={() => navigate(`/matches/${entry.match.id}/schedule`)}
                  onCancelForm={() => setReportingMatchId(null)}
                  onSubmitScore={(sets) => handleReportScore(entry, entry.match.id, sets)}
                  onOpenProposal={() => navigate(`/matches/${entry.match.id}`)}
                  onOpenConfirmScore={() => navigate(`/matches/${entry.match.id}/confirm`)}
                  onAccept={() => handleAcceptInvite(entry.match.id)}
                  onDecline={() => handleDeclineInvite(entry.match.id)}
                  onRemind={() =>
                    entry.kind === "friendly"
                      ? handleRemindFriendly(entry.match.id)
                      : handleRemindLeague(entry.league_id, entry.match.id)
                  }
                  friendlyRequireConfirm={friendlyRequireConfirm}
                  setFriendlyRequireConfirm={setFriendlyRequireConfirm}
                />
              ))}
            </div>
            {sortedToPlay.length > 1 && (
              <div className="tp-dots">
                {sortedToPlay.map((entry, i) => (
                  <span key={entry.match.id} className={i === activeToPlay ? "tp-dot is-on" : "tp-dot"} />
                ))}
              </div>
            )}
          </>
        )
      )}

      {itemCount > 0 && (
        <button type="button" className="home-inprogress" onClick={() => navigate("/needs-you")}>
          <span className="home-inprogress-label">{t("משחקים בתהליך")}</span>
          <span className="home-inprogress-count" dir="ltr">
            {itemCount}
          </span>
          <ChevronIcon aria-hidden="true" />
        </button>
      )}

      {shownHomeLeagues.length > 0 && (
        <div className="home-leagues">
          <div className="home-leagues-head">
            <h2 className="home-leagues-title">{t("הליגות שלי")}</h2>
            <span className="home-leagues-count">{sortedHomeLeagues.length}</span>
          </div>
          <ul className="home-leagues-list">
            {shownHomeLeagues.map((l) => {
              const round = currentRoundNumber(l.schedule_started_at, l.round_length_days || 7);
              const metaParts = [
                `${l.member_count} players`,
                cycleLabelEn(l),
                round !== null ? `R${round}` : null,
                l.is_open ? `NTRP ${(l.level_min ?? 1.5).toFixed(1)}–${(l.level_max ?? 5.5).toFixed(1)}` : null,
              ].filter(Boolean);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    className="home-league-row"
                    onClick={() => navigate(`/leagues/${l.id}`)}
                  >
                    <span className="home-league-main">
                      <span className="home-league-name">
                        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                          {l.name}
                        </span>
                      </span>
                      <span className="home-league-meta" dir="ltr">
                        {metaParts.join(" · ")}
                      </span>
                    </span>
                    <span className="home-league-rank">{l.my_rank ? `#${l.my_rank}` : "—"}</span>
                  </button>
                </li>
              );
            })}
            {extraHomeLeagues > 0 && (
              <li>
                <button type="button" className="home-league-more" onClick={() => navigate("/leagues")}>
                  {t("עוד {n}", { n: extraHomeLeagues })}
                  <ChevronIcon className="chevron-icon" aria-hidden="true" />
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
        </>
      )}
      </div>

      {settingLevel && selectedSportId && (
        <RatingQuestionnaire
          initial
          sportId={selectedSportId}
          sportName={sportName}
          onClose={() => {
            setSettingLevel(false);
            reloadRatings();
          }}
        />
      )}
    </div>
  );
}
