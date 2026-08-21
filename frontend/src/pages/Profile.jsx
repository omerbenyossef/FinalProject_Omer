import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon } from "../Icons.jsx";
import {
  formatDayMonthTime,
  roundDueDateObj,
  matchScheduleState,
  hasHebrewChars,
  NTRP_STEPS,
  activeRoundStatus,
  daysUntil,
  weekdayShort,
} from "../matchUtils.js";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";
import EmptyLine from "../EmptyLine.jsx";

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

function playersLabel(n, t) {
  return n === 1 ? t("שחקן אחד") : `${n} ${t("שחקנים")}`;
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
  const scheduleState = pendingInvite || needsMyConfirm ? null : matchScheduleState(m, userId);

  const scheduledText = m.scheduled_at ? formatDayMonthTime(new Date(m.scheduled_at)) : "";
  let timeLabel;
  if (needsMyConfirm) timeLabel = scheduledText || t("טרם נקבעה");
  else if (pendingInvite || scheduleState === "unscheduled") timeLabel = t("טרם נקבעה");
  else if (scheduleState === "proposed_by_them") timeLabel = t("הציעו {time}", { time: scheduledText });
  else timeLabel = scheduledText;

  let action = null;
  if (needsMyConfirm) {
    action = { title: t("אשר תוצאה"), dependsOnMe: true, onPress: onOpenConfirmScore };
  } else if (pendingInvite) {
    if (isInviter) action = { title: t("תזכר"), dependsOnMe: false, onPress: onRemind };
  } else if (scheduleState === "unscheduled") {
    // No lime dot for scheduling actions — see scheduleflow107.md's color
    // rule: proposing/confirming a time is a response, not a score.
    action = { title: t("קבע שעה"), dependsOnMe: true, noDot: true, onPress: onStartSchedule };
  } else if (scheduleState === "proposed_by_them") {
    action = { title: t("אשר את השעה"), dependsOnMe: true, noDot: true, onPress: onOpenProposal };
  } else if (scheduleState === "proposed_by_me") {
    action = { title: t("תזכר"), dependsOnMe: false, onPress: onRemind };
  } else if (scheduleState === "ready") {
    action = { title: t("דווח תוצאה"), dependsOnMe: true, onPress: onStartReport };
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
        <Avatar name={opponent.name} size={42} dim={pendingInvite} />
        <div className="tp-id">
          <Link to={`/players/${opponent.id}`} className="tp-name">
            <span dir="auto" style={{ unicodeBidi: "isolate" }}>
              {opponent.name}
            </span>
          </Link>
          <div className="tp-state" dir="ltr">
            {isFriendly ? (
              <>FRIENDLY · {pendingInvite ? "INVITED" : "ACCEPTED"}</>
            ) : hasHebrewChars(entry.league_name) ? (
              <>
                <span className="tp-state-sans" dir="auto">
                  {entry.league_name}
                </span>{" "}
                · R{m.round_number}
              </>
            ) : (
              <>
                {entry.league_name?.toUpperCase()} · R{m.round_number}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="tp-facts">
        {(myNtrp != null || oppNtrp != null) && (
          <div className="tp-fact">
            <span>NTRP</span>
            <span dir="ltr">
              {myNtrp != null ? myNtrp.toFixed(1) : "—"} · {oppNtrp != null ? oppNtrp.toFixed(1) : "—"}
            </span>
          </div>
        )}
        <div className="tp-fact">
          <span>HEAD TO HEAD</span>
          <span dir="ltr">{h2h && h2h.wins + h2h.losses > 0 ? `${h2h.wins}-${h2h.losses}` : t("מפגש ראשון")}</span>
        </div>
        <div className="tp-fact">
          <span>TIME</span>
          <span dir="ltr">{timeLabel}</span>
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
          <button
            type="button"
            className={`tp-action${action.dependsOnMe ? "" : " is-waiting"}`}
            onClick={action.onPress}
            disabled={busy}
          >
            {action.dependsOnMe && !action.noDot && <span className="tp-dot-lime" aria-hidden="true" />}
            <span className="tp-action-label">{action.title}</span>
            <ChevronIcon aria-hidden="true" />
          </button>
        )
      )}
    </div>
  );
}

// 109a — a player with no league yet. Two asymmetric paths, not a menu:
// joining a public league is the recommended one (lime dot), starting your
// own is the secondary fallback. See firstdayandemptystates109.md section 1.
function NoLeagueBlock({ t, navigate, openCount }) {
  return (
    <div className="home-nolg">
      <h2 className="home-nolg-title" dir="rtl">
        {t("עוד אין לך ליגה. שתי דרכים להתחיל.")}
      </h2>

      <div className="home-nolg-option is-primary">
        <div className="home-nolg-option-head">
          <span className="home-nolg-option-title">{t("הצטרף לליגה ציבורית")}</span>
          <span className="home-nolg-tag">{t("{n} OPEN", { n: openCount })}</span>
        </div>
        <p className="home-nolg-option-sub">{t("כל אחד יכול להצטרף, בלי קוד הזמנה.")}</p>
        <button type="button" className="home-nolg-action" onClick={() => navigate("/leagues/open")}>
          <span className="home-nolg-dot" aria-hidden="true" />
          {t("עיין בליגות פתוחות")}
          <ChevronIcon aria-hidden="true" />
        </button>
      </div>

      <div className="home-nolg-option">
        <div className="home-nolg-option-head">
          <span className="home-nolg-option-title dim">{t("פתח ליגה משלך")}</span>
        </div>
        <p className="home-nolg-option-sub">{t("הזמן חברים וקבע את חוקי הליגה.")}</p>
        <button type="button" className="home-nolg-action dim" onClick={() => navigate("/leagues?create=1")}>
          {t("צור ליגה חדשה")}
          <ChevronIcon aria-hidden="true" />
        </button>
      </div>

      <Link to="/friendly/new" className="home-nolg-friendly">
        {t("OR PLAY A FRIENDLY WITHOUT A LEAGUE")}
      </Link>
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
            <span className="home-solo-who-name" dir="auto">
              {m.name}
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
  const { nextMatches, matchesLoading, reload: loadNextMatches, openAction, itemCount, triggerOpenAction } =
    useOpenAction();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [myLeagues, setMyLeagues] = useState([]);
  const [busy, setBusy] = useState(false);
  const [reportingMatchId, setReportingMatchId] = useState(null);
  const [myRatings, setMyRatings] = useState([]);
  const [friendlyRequireConfirm, setFriendlyRequireConfirm] = useState(true);
  const [activeToPlay, setActiveToPlay] = useState(0);
  const [standingsByLeague, setStandingsByLeague] = useState({});
  const [h2hByOpponent, setH2hByOpponent] = useState({});
  const [allLeagues, setAllLeagues] = useState([]);
  const [soloMembers, setSoloMembers] = useState([]);
  const carouselRef = useRef(null);
  const requestedLeagueStandingsRef = useRef(new Set());
  const requestedH2hRef = useRef(new Set());

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
  const leagueMatchesForSport = relevantEntries.filter(
    (entry) => entry.kind !== "friendly" && entry.match.status === "pending"
  );
  const friendlyMatchesForSport = relevantEntries.filter(
    (entry) => entry.kind === "friendly" && entry.match.status === "pending"
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedToPlay.map((e) => e.match.id).join(",")]);

  if (!user) return null;

  const winRate =
    stats && stats.matches_played > 0 ? Math.round((stats.wins / stats.matches_played) * 100) : null;
  const myLeaguesPreview = myLeaguesForSport.slice(0, 2);
  const myRating = myRatings.find((r) => r.sport_id === selectedSportId) || null;
  const sportName = sports.find((s) => s.id === selectedSportId)?.name;

  function oppNtrpFor(entry) {
    if (entry.kind === "friendly") return null;
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
    <div>
      <header className="home-head">
        <div className="home-head-top">
          <div className="home-name-row">
            <h1 className="home-name">{user.name}</h1>
            {(isNoLeague || isRoundNotOpened) && (
              <span className="home-tag">{isNoLeague ? "DAY 1" : "1 LEAGUE"}</span>
            )}
            {itemCount > 0 && (
              <button type="button" className="home-tag home-tag-needs" onClick={triggerOpenAction}>
                {itemCount}
              </button>
            )}
          </div>
          <PageHelp
            pageKey="profile"
            title="עמוד הבית"
            text="כאן תראו את המשחק שצריך לשחק או לאשר השבוע, את הליגות שאתם חברים בהן, ואת התוצאות האחרונות שלכם."
          />
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
          !isRoundNotOpened && (
            <Link to="/leagues" className="home-rating-empty">
              {t("לא מדורג")} · {t("קבע רמה")}
            </Link>
          )
        )}
      </header>

      {error && <p className="error">{t(error)}</p>}

      {isNoLeague ? (
        <NoLeagueBlock t={t} navigate={navigate} openCount={openLeagueCount} />
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
      </div>
        </>
      )}
    </div>
  );
}
