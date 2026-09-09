import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import Avatar from "../Avatar.jsx";
import RatingQuestionnaire from "../RatingQuestionnaire.jsx";
import { UserPlusIcon, CalendarIcon, ChevronIcon, SettingsIcon, PlusIcon } from "../Icons.jsx";
import {
  formatSets,
  roundDueDate,
  roundDueDateObj,
  nextSchedulePreview,
  matchScheduleState,
  scheduleRowStatus,
  formatWeekdayTime,
  activeRoundStatus,
  daysLeftPhrase,
  getActionCandidates,
  buildOpenAction,
} from "../matchUtils.js";
import { SkeletonPageHeader, SkeletonHeroStat, SkeletonStandingsTable } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";
import EmptyLine from "../EmptyLine.jsx";

function groupMatchesByRound(matches) {
  const groups = new Map();
  for (const match of matches) {
    const key = match.round_number ?? "none";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === "none") return 1;
    if (b === "none") return -1;
    return a - b;
  });
  return sortedKeys.map((round) => ({ round, matches: groups.get(round) }));
}

export default function LeagueDetail() {
  const { leagueId } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromLink = (searchParams.get("code") || "").trim();
  const { nextMatches, reload: reloadOpenAction } = useOpenAction();

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("standings");
  const [showAddRoundConfirm, setShowAddRoundConfirm] = useState(false);
  const [reportingMyMatch, setReportingMyMatch] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [selectedRound, setSelectedRound] = useState(null);
  const [ratingFlow, setRatingFlow] = useState(null); // { existingResult, joinCode } | null
  const autoJoinAttempted = useRef(false);
  const initialTabSet = useRef(false);

  const isMember = members.some((m) => m.id === user?.id);

  useEffect(() => {
    if (!league) return;
    if (!initialTabSet.current) {
      initialTabSet.current = true;
      const tabFromLink = searchParams.get("tab");
      if (tabFromLink === "matches" || tabFromLink === "standings") {
        setActiveTab(tabFromLink);
      } else if (isMember) {
        setActiveTab("stats");
      }
      return;
    }
    if (!isMember && activeTab === "stats") setActiveTab("standings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, isMember]);

  async function loadAll() {
    try {
      const [leagueData, membersData, standingsData, allMatchesData] = await Promise.all([
        api.getLeague(leagueId),
        api.listMembers(leagueId),
        api.getStandings(leagueId),
        api.listAllMatches(leagueId),
      ]);
      setLeague(leagueData);
      setMembers(membersData);
      setStandings(standingsData);
      setAllMatches(allMatchesData);

      if (user) {
        const matchesData = await api.listMatches(leagueId);
        setMatches(matchesData);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!/^\d+$/.test(leagueId)) {
      navigate("/leagues", { replace: true });
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, user]);

  async function startJoinFlow(codeOverride) {
    const joinCode = codeOverride ?? codeFromLink;
    setBusy(true);
    setError("");
    try {
      const check = await api.checkRating(leagueId);
      setRatingFlow({ existingResult: check.has_rating ? check.result : null, joinCode });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRatingJoined() {
    setRatingFlow(null);
    await loadAll();
  }

  useEffect(() => {
    if (!user || !league || isMember || !codeFromLink || autoJoinAttempted.current) return;
    autoJoinAttempted.current = true;
    startJoinFlow(codeFromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, league, isMember, codeFromLink]);

  async function handleShareWhatsApp() {
    setInviteError("");
    setInviteLoading(true);
    try {
      let code = inviteCode;
      if (!code) {
        const data = await api.getInviteCode(leagueId);
        code = data.code;
        setInviteCode(code);
      }
      const url = `${window.location.origin}/leagues/${leagueId}?code=${code}`;
      const message = t('בוא/י תצטרף/י לליגה "{name}" ב-Rally!\n{url}', { name: league.name, url });
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleGenerateSchedule() {
    setBusy(true);
    setError("");
    try {
      await api.generateSchedule(leagueId);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddRound() {
    await handleGenerateSchedule();
    setShowAddRoundConfirm(false);
  }

  async function handleReportScore(matchId, sets) {
    setBusy(true);
    setError("");
    try {
      await api.reportScore(leagueId, matchId, sets);
      await loadAll();
      reloadOpenAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickConfirmSchedule(matchId) {
    setBusy(true);
    setError("");
    try {
      await api.confirmMatchSchedule(matchId);
      await loadAll();
      reloadOpenAction();
    } catch (err) {
      if (err.status === 409) {
        navigate(`/matches/${matchId}`);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelSchedule(matchId) {
    setBusy(true);
    setError("");
    try {
      await api.declineMatchSchedule(matchId);
      await loadAll();
      reloadOpenAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelMatch(matchId) {
    setBusy(true);
    setError("");
    try {
      await api.cancelMatch(leagueId, matchId);
      await loadAll();
      reloadOpenAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLeaveLeague() {
    setBusy(true);
    setError("");
    try {
      await api.leaveLeague(leagueId);
      navigate("/leagues");
    } catch (err) {
      setError(err.message);
      setBusy(false);
      setShowLeaveConfirm(false);
    }
  }

  const groupedRounds = groupMatchesByRound(allMatches);
  const existingRoundNumbers = groupedRounds.map((g) => g.round).filter((r) => r !== "none");
  const latestRound = existingRoundNumbers.length > 0 ? Math.max(...existingRoundNumbers) : null;
  const shownRound = selectedRound ?? latestRound;

  if (!league) {
    return (
      <div>
        <SkeletonPageHeader />
        <div className="section-tabs">
          <span className="section-tab active">{t("טבלה")}</span>
        </div>
        <SkeletonHeroStat />
        <div style={{ marginTop: 20 }}>
          <SkeletonStandingsTable />
        </div>
      </div>
    );
  }

  const isCreator = league.created_by === user?.id;
  const myStanding = standings.find((row) => row.user.id === user?.id);
  const myWinRate =
    myStanding && myStanding.played > 0 ? Math.round((myStanding.wins / myStanding.played) * 100) : null;
  const myRankIndex = standings.findIndex((row) => row.user.id === user?.id);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;
  const roundsClosed = existingRoundNumbers.length;
  // 109c: standings rows exist (zeroed) for every member before anyone has
  // played — don't show a hero full of dashes for that, and don't show a
  // full standings table of zeros either (see the standings tab below).
  const myPlayedNone = !myStanding || myStanding.played === 0;
  const noResultsYet = standings.length > 0 && standings.every((row) => row.played === 0);
  const myFirstPendingMatch =
    allMatches
      .filter((m) => (m.player1.id === user?.id || m.player2.id === user?.id) && m.status === "pending")
      .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0))[0] ?? null;
  const myRoundRows = allMatches
    .filter((m) => m.player1.id === user?.id || m.player2.id === user?.id)
    .filter((m) => m.round_number)
    .sort((a, b) => a.round_number - b.round_number)
    .map((m) => {
      const iAmPlayer1 = m.player1.id === user?.id;
      const opponent = iAmPlayer1 ? m.player2 : m.player1;
      const mySets = iAmPlayer1
        ? m.sets
        : m.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));
      const myScore = iAmPlayer1 ? m.player1_score : m.player2_score;
      const theirScore = iAmPlayer1 ? m.player2_score : m.player1_score;
      return {
        round: m.round_number,
        opponentName: opponent.name,
        status: m.status,
        mySets,
        won: m.status === "completed" && myScore > theirScore,
      };
    });
  const myCompletedRounds = myRoundRows.filter((r) => r.status === "completed");
  const myLastWon = myCompletedRounds.length ? myCompletedRounds[myCompletedRounds.length - 1].won : null;
  let myStreak = 0;
  for (let i = myCompletedRounds.length - 1; i >= 0 && myCompletedRounds[i].won === myLastWon; i--) {
    myStreak++;
  }
  const myLeaderPoints = standings.length ? standings[0].points : 0;
  const myWinsBehind = Math.ceil(Math.max(myLeaderPoints - (myStanding?.points ?? 0), 0) / 3);
  const hasSchedule = allMatches.length > 0;
  const roundsCount = new Set(allMatches.map((m) => m.round_number).filter(Boolean)).size;
  const nextRound = roundsCount + 1;
  const { pairs: nextPairs, roundsToCreate } = nextSchedulePreview(members, allMatches);
  const lastNewRound = nextRound + Math.max(roundsToCreate, 1) - 1;
  const nextRoundDueDate = roundDueDate(
    league.schedule_started_at || new Date().toISOString(),
    lastNewRound,
    league.round_length_days
  );
  const isLatestRound = shownRound === latestRound;
  const shownRoundMatches = groupedRounds.find((g) => g.round === shownRound)?.matches || [];
  const shownRoundCloses = shownRound
    ? roundDueDate(league.schedule_started_at, shownRound, league.round_length_days)
    : "";
  const prevRound = existingRoundNumbers.filter((r) => r < shownRound).sort((a, b) => b - a)[0] ?? null;
  const nextRoundNav = existingRoundNumbers.filter((r) => r > shownRound).sort((a, b) => a - b)[0] ?? null;
  const legacyMatches = allMatches.filter((m) => !m.round_number);

  const roundLengthDays = league.round_length_days || 7;
  const { round: headCurrentRound, daysLeft: headDaysLeft } = activeRoundStatus(
    league.schedule_started_at,
    roundLengthDays
  );
  const rankDelta = myStanding?.rank_delta ?? 0;
  // A points tie at the bottom of the table still means "behind" even though
  // the win-count gap rounds to 0 — only rank 1 counts as actually leading.
  const winsBehindDisplay = Math.max(myWinsBehind, 1);
  const plannedRounds = existingRoundNumbers.length + roundsToCreate;
  const stripRounds = myRoundRows;
  const rankDeltaLabel =
    rankDelta > 0
      ? rankDelta === 1
        ? t("עלית מקום אחד")
        : t("עלית {n} מקומות", { n: rankDelta })
      : rankDelta < 0
      ? Math.abs(rankDelta) === 1
        ? t("ירדת מקום אחד")
        : t("ירדת {n} מקומות", { n: Math.abs(rankDelta) })
      : t("בלי שינוי");
  const behindLabel =
    myRank === 1
      ? t("אתה מוביל")
      : winsBehindDisplay === 1
      ? t("ניצחון אחד מהמוביל")
      : t("{n} ניצחונות מהמוביל", { n: winsBehindDisplay });
  const lastCompleted = myCompletedRounds[myCompletedRounds.length - 1] ?? null;
  const streakSub = lastCompleted ? t("מול {name}", { name: lastCompleted.opponentName }) : "";

  const leagueEntries = nextMatches.filter((e) => e.league_id === Number(leagueId));
  const leagueOpenAction = buildOpenAction(getActionCandidates(leagueEntries, user?.id), user?.id, t);
  let leagueActionOpponent = null;
  let leagueActionSub = "";
  let leagueActionBtnLabel = "";
  if (leagueOpenAction) {
    const actionMatch = leagueOpenAction.match;
    leagueActionOpponent = actionMatch.player1.id === user?.id ? actionMatch.player2 : actionMatch.player1;
    if (leagueOpenAction.kind === "confirm") {
      leagueActionSub = t("יש לך תוצאה לאישור");
      leagueActionBtnLabel = t("לאישור");
    } else if (leagueOpenAction.kind === "schedule") {
      leagueActionSub = t("לאישור השעה");
      leagueActionBtnLabel = t("אשר שעה");
    } else {
      const dueForAction = roundDueDateObj(
        leagueOpenAction.entry.schedule_started_at,
        actionMatch.round_number,
        roundLengthDays
      );
      const daysLeftForAction = Math.max(
        dueForAction ? Math.ceil((dueForAction.getTime() - Date.now()) / 86400000) : 0,
        0
      );
      leagueActionSub =
        daysLeftForAction === 1 ? t("נותר יום אחד לדיווח") : t("נותרו {n} ימים לדיווח", { n: daysLeftForAction });
      leagueActionBtnLabel = t("דווח");
    }
  }

  function handleOpenLeagueAction() {
    if (!leagueOpenAction) return;
    if (leagueOpenAction.kind === "confirm") {
      navigate(`/matches/${leagueOpenAction.match.id}/confirm`);
    } else {
      setActiveTab("matches");
      setSelectedRound(leagueOpenAction.match.round_number ?? null);
    }
  }

  return (
    <div>
      <header className="ld-head">
        <div className="ld-head-nav">
          <Link to="/leagues" className="back-link">
            <ChevronIcon aria-hidden="true" />
            {t("ליגות")}
          </Link>
          <div className="page-title-actions">
            <PageHelp
              pageKey="leagueDetail"
              title="עמוד הליגה"
              text="כאן תראו את טבלת הדירוג, את המשחקים שלכם ושל שאר חברי הליגה, ואת הסטטיסטיקה האישית שלכם בליגה הזו."
            />
            {(isCreator || user?.is_admin) && (
              <Link to={`/leagues/${leagueId}/manage`} className="ld-head-settings" aria-label={t("הגדרות הליגה")}>
                <SettingsIcon aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        <h1 className="ld-title">
          <span dir="auto" style={{ unicodeBidi: "isolate" }}>
            {league.name}
          </span>
        </h1>

        <div className="ld-meta" dir="ltr">
          {[
            headCurrentRound !== null ? t("מחזור {n}", { n: headCurrentRound }) : null,
            headCurrentRound !== null ? daysLeftPhrase(headDaysLeft, t) : null,
            t("{n} שחקנים", { n: members.length }),
          ]
            .filter(Boolean)
            .map((part, i) => (
              <span key={i} style={{ display: "contents" }}>
                {i > 0 && <span className="sep">·</span>}
                <span>{part}</span>
              </span>
            ))}
        </div>

        <nav className="ld-tabs">
          {isMember && (
            <button
              type="button"
              className={activeTab === "stats" ? "is-on" : ""}
              onClick={() => setActiveTab("stats")}
            >
              {t("הסטטיסטיקה שלי")}
            </button>
          )}
          <button
            type="button"
            className={activeTab === "standings" ? "is-on" : ""}
            onClick={() => setActiveTab("standings")}
          >
            {t("טבלה")}
          </button>
          <button
            type="button"
            className={activeTab === "matches" ? "is-on" : ""}
            onClick={() => setActiveTab("matches")}
          >
            {t("משחקים")}
          </button>
        </nav>
      </header>

      <div className="league-detail-actions">
        {!isMember && user && (league.is_open || codeFromLink) && (
          <button className="btn-primary" onClick={() => startJoinFlow()} disabled={busy}>
            {busy ? t("מצטרף...") : t("הצטרפות לליגה")}
          </button>
        )}
        {!isMember && user && !league.is_open && !codeFromLink && (
          <p className="muted">
            {t("הליגה סגורה. כדי להצטרף צריך קישור הזמנה מאחד מחברי הליגה.")}
          </p>
        )}
      </div>

      {error && <p className="error">{t(error)}</p>}

      <div>
        {activeTab === "stats" && isMember && (
          <div className="my-stats">
            {myPlayedNone ? (
              <EmptyLine
                sentence={t("עוד לא שיחקת בליגה הזאת.")}
                action={
                  !leagueOpenAction &&
                  myFirstPendingMatch && (
                    <button
                      type="button"
                      className="empty-line-action"
                      onClick={() => navigate(`/matches/${myFirstPendingMatch.id}/schedule`)}
                    >
                      <span className="empty-line-dot" aria-hidden="true" />
                      {t("קבע שעה למשחק הראשון")}
                    </button>
                  )
                }
              />
            ) : (
              <>
                {leagueOpenAction && (
                  <div className="ms-open">
                    <div className="ms-open-body">
                      <div className="ms-open-title">
                        {leagueOpenAction.match.round_number != null && (
                          <>{t("מחזור {n}", { n: leagueOpenAction.match.round_number })} · </>
                        )}
                        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                          {leagueActionOpponent?.name}
                        </span>
                      </div>
                      <div className="ms-open-sub">{leagueActionSub}</div>
                    </div>
                    <button type="button" className="ms-open-btn" onClick={handleOpenLeagueAction}>
                      {leagueActionBtnLabel}
                    </button>
                  </div>
                )}

                <div className="ms-quad">
                  <div className="ms-quad-cell">
                    <div className="ms-quad-label">{t("מקום")}</div>
                    <div className="ms-quad-value" dir="ltr">
                      {myRank ?? "–"}
                      {myRank != null && <span className="ms-quad-unit">/{members.length}</span>}
                    </div>
                    <div className="ms-quad-sub">{rankDeltaLabel}</div>
                  </div>

                  <div className="ms-quad-cell">
                    <div className="ms-quad-label">{t("נקודות")}</div>
                    <div className="ms-quad-value" dir="ltr">
                      {myStanding?.points ?? 0}
                    </div>
                    <div className="ms-quad-sub">{behindLabel}</div>
                  </div>

                  <div className="ms-quad-cell">
                    <div className="ms-quad-label">{t("מאזן")}</div>
                    <div className="ms-quad-value" dir="ltr">
                      {myStanding?.wins ?? 0}-{myStanding?.losses ?? 0}
                    </div>
                    <div className="ms-quad-sub">
                      {myWinRate != null ? t("{n}% ניצחונות", { n: myWinRate }) : ""}
                    </div>
                  </div>

                  <div className="ms-quad-cell">
                    <div className="ms-quad-label">{t("רצף")}</div>
                    <div className="ms-quad-value" dir="ltr">
                      {myStreak > 0 ? `${myLastWon ? "W" : "L"}${myStreak}` : "–"}
                    </div>
                    <div className="ms-quad-sub">{streakSub}</div>
                  </div>
                </div>

                <div className="ms-strip-head">
                  <span>{t("מחזור אחרי מחזור")}</span>
                  <span dir="ltr">
                    {myCompletedRounds.length} / {plannedRounds}
                  </span>
                </div>
                <div className="ms-strip">
                  {stripRounds.map((r) => (
                    <div
                      className={`ms-strip-cell${r.status === "pending" ? " next" : ""}`}
                      key={r.round}
                    >
                      <span className={`ms-strip-wl${r.won ? " win" : ""}`}>
                        {r.status === "completed" ? (r.won ? "W" : "L") : "–"}
                      </span>
                      <span className="ms-strip-num" dir="ltr">
                        R{r.round}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {isMember && !isCreator && (
              <button
                type="button"
                className="league-leave-chip"
                style={{ marginTop: 24 }}
                onClick={() => setShowLeaveConfirm(true)}
              >
                {t("יציאה מהליגה")}
              </button>
            )}
          </div>
        )}

        {activeTab === "standings" && (
          <>
            {noResultsYet && (
              <EmptyLine sentence={t("אין עדיין תוצאות. הטבלה תיפתח אחרי המשחק הראשון.")} />
            )}
            {standings.length > 0 && !noResultsYet && (
              <div className="standings-panel">
                <div className="standings-panel-head">
                  <span />
                  <span />
                  <span />
                  <span>{t("מש׳")}</span>
                  <span>{t("נצ׳")}</span>
                  <span>{t("הפ׳")}</span>
                  <span>{t("נק׳")}</span>
                </div>

                {standings.map((row, index) => {
                  const rank = index + 1;
                  const isMe = row.user.id === user?.id;
                  const isLeader = rank === 1;
                  const shortOfMatches = row.played < roundsClosed;
                  const cls = `standings-tr${isMe ? " mine" : ""}${isLeader ? " leader" : ""}`;
                  const body = (
                    <>
                      <span className="standings-td-rank" dir="ltr">
                        {rank}
                      </span>
                      <span className="standings-td-avatar">
                        <Avatar name={row.user.name} size={24} />
                      </span>
                      <span className="standings-td-name">
                        {row.user.name}
                        {isMe && <span className="standings-you"> · {t("אתה")}</span>}
                      </span>
                      <span className={`standings-td-num${shortOfMatches ? " short" : ""}`} dir="ltr">
                        {row.played}
                      </span>
                      <span className="standings-td-num" dir="ltr">
                        {row.wins}
                      </span>
                      <span className="standings-td-num" dir="ltr">
                        {row.losses}
                      </span>
                      <span className="standings-td-pts" dir="ltr">
                        {row.points}
                      </span>
                    </>
                  );

                  return isMe ? (
                    <div className={cls} key={row.user.id}>
                      {body}
                    </div>
                  ) : (
                    <Link to={`/players/${row.user.id}`} className={cls} key={row.user.id}>
                      {body}
                    </Link>
                  );
                })}
              </div>
            )}

            {standings.length > 0 && !noResultsYet && (
              <p className="standings-hint">{t("הקשה על שחקן פותחת ראש בראש מולו")}</p>
            )}
          </>
        )}

        {activeTab === "matches" && (
          <div className="league-matches-tab">
            {hasSchedule && isCreator && (
              <div className="schedule-status-card">
                <div>
                  <div className="schedule-status-label">{t("לוח משחקים")}</div>
                  <div className="schedule-status-value">
                    {t("{rounds} מחזורים · {games} משחקים", { rounds: roundsCount, games: allMatches.length })}
                  </div>
                </div>
                {nextPairs.length > 0 && (
                  <button
                    type="button"
                    className="schedule-add-round-btn"
                    onClick={() => setShowAddRoundConfirm(true)}
                  >
                    {roundsToCreate > 1
                      ? t("+ {n} מחזורים", { n: roundsToCreate })
                      : t("+ מחזור {n}", { n: nextRound })}
                  </button>
                )}
              </div>
            )}

            {!hasSchedule && (
              <div className="schedule-empty">
                <CalendarIcon className="schedule-empty-icon" aria-hidden="true" />
                <p className="schedule-empty-text">
                  {t("עדיין אין לוח משחקים. {n} השחקנים בליגה מחכים לשיבוץ.", { n: members.length })}
                </p>
              </div>
            )}
            {!hasSchedule && isCreator && (
              <>
                <button
                  type="button"
                  className="btn-create-schedule"
                  onClick={handleGenerateSchedule}
                  disabled={busy || nextPairs.length === 0}
                >
                  <PlusIcon aria-hidden="true" />
                  {busy ? t("יוצר...") : t("צור לוח משחקים")}
                </button>
                {nextPairs.length > 0 && (
                  <p className="schedule-create-caption">
                    {roundsToCreate > 1
                      ? t("ייווצרו {rounds} מחזורים · {count} משחקים", {
                          rounds: roundsToCreate,
                          count: nextPairs.length,
                        })
                      : t("ייווצר מחזור {n} · {count} משחקים", { n: nextRound, count: nextPairs.length })}
                  </p>
                )}
              </>
            )}

            {hasSchedule && shownRound !== null && (
              <>
                <div className="round-line">
                  <div className="round-line-nav">
                    <button
                      type="button"
                      className="round-arrow"
                      disabled={prevRound === null}
                      onClick={() => setSelectedRound(prevRound)}
                      aria-label={t("מחזור קודם")}
                    >
                      <ChevronIcon aria-hidden="true" />
                    </button>
                    <span className="round-line-num">{t("מחזור {n}", { n: shownRound })}</span>
                    <button
                      type="button"
                      className="round-arrow next"
                      disabled={nextRoundNav === null}
                      onClick={() => setSelectedRound(nextRoundNav)}
                      aria-label={t("מחזור הבא")}
                    >
                      <ChevronIcon aria-hidden="true" />
                    </button>
                  </div>
                  {shownRoundCloses && (
                    <span className="round-line-closes">
                      {isLatestRound
                        ? t("נסגר ב-{date}", { date: shownRoundCloses })
                        : t("נסגר ב-{date} (עבר)", { date: shownRoundCloses })}
                    </span>
                  )}
                </div>

                {shownRoundMatches.length === 0 ? (
                  <>
                    <p className="schedule-empty-text" style={{ marginTop: 18 }}>
                      {t("עוד לא נוצר לוח משחקים למחזור הזה")}
                    </p>
                    {isCreator && (
                      <button
                        type="button"
                        className="btn-create-schedule"
                        onClick={handleGenerateSchedule}
                        disabled={busy}
                      >
                        <PlusIcon aria-hidden="true" />
                        {busy ? t("יוצר...") : t("צור לוח משחקים")}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="fixtures">
                    {shownRoundMatches.map((match) => (
                      <FixtureRow
                        key={match.id}
                        match={match}
                        userId={user?.id}
                        busy={busy}
                        isReporting={reportingMyMatch}
                        onStartReport={() => setReportingMyMatch(true)}
                        onQuickConfirmSchedule={() => handleQuickConfirmSchedule(match.id)}
                        onCancelSchedule={() => handleCancelSchedule(match.id)}
                        onSubmitScore={(sets) => {
                          handleReportScore(match.id, sets);
                          setReportingMyMatch(false);
                        }}
                        onCancelForm={() => setReportingMyMatch(false)}
                        onCancelMatch={() => handleCancelMatch(match.id)}
                        onEditScore={(sets) => handleReportScore(match.id, sets)}
                        onNeedsConfirm={() => navigate(`/matches/${match.id}/confirm`)}
                        maxSets={league.best_of}
                      />
                    ))}
                  </div>
                )}

                {!isLatestRound && (
                  <button
                    type="button"
                    className="back-to-active-round"
                    onClick={() => setSelectedRound(null)}
                  >
                    {t("חזרה למחזור {n} ›", { n: latestRound })}
                  </button>
                )}

                <Link to={`/leagues/${leagueId}/rounds`} className="all-rounds-row">
                  <span>{t("כל המחזורים")}</span>
                  <span className="all-rounds-meta">
                    {t("{rounds} מחזורים · {games} משחקים", {
                      rounds: existingRoundNumbers.length,
                      games: allMatches.length,
                    })}
                  </span>
                  <ChevronIcon aria-hidden="true" />
                </Link>

                {legacyMatches.length > 0 && (
                  <div>
                    <div className="ms-label" style={{ marginTop: 24 }}>
                      {t("משחקים ללא מחזור")}
                    </div>
                    <div className="fixtures">
                      {legacyMatches.map((match) => (
                        <FixtureRow
                          key={match.id}
                          match={match}
                          userId={user?.id}
                          busy={busy}
                          isReporting={false}
                          onEditScore={(sets) => handleReportScore(match.id, sets)}
                          onNeedsConfirm={() => navigate(`/matches/${match.id}/confirm`)}
                          maxSets={league.best_of}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {inviteError && <p className="error">{t(inviteError)}</p>}

      {isMember && (
        <button
          type="button"
          className="invite-fab"
          onClick={handleShareWhatsApp}
          disabled={inviteLoading}
        >
          <UserPlusIcon aria-hidden="true" />
          {inviteLoading ? t("טוען...") : t("הזמן חבר לליגה")}
        </button>
      )}

      {showAddRoundConfirm && (
        <AddRoundConfirmSheet
          nextRound={nextRound}
          roundsToCreate={roundsToCreate}
          pairs={nextPairs}
          dueDate={nextRoundDueDate}
          busy={busy}
          onConfirm={handleAddRound}
          onClose={() => setShowAddRoundConfirm(false)}
        />
      )}

      {showLeaveConfirm && (
        <LeaveLeagueConfirmSheet
          busy={busy}
          onConfirm={handleLeaveLeague}
          onClose={() => setShowLeaveConfirm(false)}
        />
      )}

      {ratingFlow && (
        <RatingQuestionnaire
          league={league}
          sportName={league.sport.name}
          existingResult={ratingFlow.existingResult}
          joinCode={ratingFlow.joinCode}
          onClose={() => setRatingFlow(null)}
          onJoined={handleRatingJoined}
        />
      )}
    </div>
  );
}

function LeaveLeagueConfirmSheet({ busy, onConfirm, onClose }) {
  const { t } = useLanguage();

  return (
    <div className="confirm-sheet-overlay" onClick={onClose}>
      <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-sheet-handle" />
        <div className="confirm-sheet-title">{t("לצאת מהליגה?")}</div>
        <p className="add-round-subtitle">
          {t("התוצאות שלך יישארו בטבלה עד סוף המחזור. כדי לחזור תצטרך הזמנה חדשה.")}
        </p>

        <div className="add-round-actions">
          <button
            type="button"
            className="confirm-sheet-btn-confirm confirm-sheet-btn-danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t("יוצא...") : t("יציאה מהליגה")}
          </button>
          <button type="button" className="link-btn add-round-cancel" onClick={onClose}>
            {t("ביטול")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddRoundConfirmSheet({ nextRound, roundsToCreate, pairs, dueDate, busy, onConfirm, onClose }) {
  const { t } = useLanguage();

  return (
    <div className="confirm-sheet-overlay" onClick={onClose}>
      <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-sheet-handle" />
        <div className="confirm-sheet-title">
          {roundsToCreate > 1
            ? t("להוסיף {n} מחזורים?", { n: roundsToCreate })
            : t("להוסיף מחזור {n}?", { n: nextRound })}
        </div>
        <p className="add-round-subtitle">
          {t("{count} משחקים · לשחק עד {date}", { count: pairs.length, date: dueDate })}
        </p>

        <div className="add-round-pairs">
          {pairs.map(([p1, p2], i) => (
            <div className="add-round-pair-row" key={i}>
              <span>{p1.name}</span>
              <span className="add-round-vs">vs</span>
              <span>{p2.name}</span>
            </div>
          ))}
        </div>

        <div className="add-round-actions">
          <button type="button" className="confirm-sheet-btn-confirm" onClick={onConfirm} disabled={busy}>
            {busy ? t("מוסיף...") : t("הוסף מחזור")}
          </button>
          <button type="button" className="link-btn add-round-cancel" onClick={onClose}>
            {t("ביטול")}
          </button>
        </div>
      </div>
    </div>
  );
}


const FX_STATUS_TAG = { no_time: "NO TIME", sent: "SENT", asked_you: "ASKED YOU", set: "SET" };

function FixtureRow({
  match,
  userId,
  busy,
  isReporting,
  onStartReport,
  onQuickConfirmSchedule,
  onCancelSchedule,
  onSubmitScore,
  onCancelForm,
  onCancelMatch,
  onEditScore,
  onNeedsConfirm,
  maxSets,
}) {
  const [editing, setEditing] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();

  const mine = match.player1.id === userId || match.player2.id === userId;
  const isCompleted = match.status === "completed";
  const isPendingConfirmation = match.status === "pending_confirmation";
  const isDisputed = match.status === "disputed";
  // Round 2 (a correction sent after a dispute) keeps status pending_confirmation
  // and reported_by unchanged — it's the ORIGINAL reporter who now needs to
  // accept/reject the correction, the opposite of round 1's polarity.
  const inCorrectionRound = match.corrected_sets != null;
  const iNeedToConfirm =
    isPendingConfirmation &&
    mine &&
    (inCorrectionRound ? match.reported_by === userId : match.reported_by !== userId);
  const iSentCorrectionPending = isPendingConfirmation && mine && inCorrectionRound && match.corrected_by === userId;
  const correctionAcceptedFinal = isCompleted && mine && inCorrectionRound && match.corrected_by === userId;
  const scheduleState = mine && onStartReport ? matchScheduleState(match, userId) : null;
  const rowStatus = mine && onStartReport ? scheduleRowStatus(match, userId) : null;

  // In my row I'm always on the "start" side, so my row doesn't jump around
  // between rounds; the score/result is shown from that side's perspective.
  const [left, right] =
    mine && match.player2.id === userId ? [match.player2, match.player1] : [match.player1, match.player2];
  // The opponent's name can only be a nested <Link> when the row itself
  // renders as a plain <div> — the iNeedToConfirm/completed-mine cases wrap
  // mainRow in a <button>, where a nested link isn't valid.
  const canLinkOpponent = !(iNeedToConfirm || (isCompleted && mine));
  const leftLinkable = !mine;
  const rightLinkable = mine ? canLinkOpponent : true;
  const leftIsPlayer1 = left.id === match.player1.id;
  const orientLeft = (sets) =>
    sets
      ? leftIsPlayer1
        ? sets
        : sets.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }))
      : null;
  const leftSets = isCompleted ? orientLeft(match.sets) : null;
  // Round 2's SENT tag shows the correction I sent (not yet accepted), so it
  // needs its own oriented copy independent of leftSets (which only reflects
  // match.sets once the match is actually completed).
  const correctedLeftSets = iSentCorrectionPending ? orientLeft(match.corrected_sets) : null;
  // A disputed match keeps both claims side by side, one per original
  // submitter — orient each to "my games first" regardless of who made it.
  const myDisputeSets = isDisputed ? orientLeft(userId === match.reported_by ? match.sets : match.corrected_sets) : null;
  const theirDisputeSets = isDisputed
    ? orientLeft(userId === match.reported_by ? match.corrected_sets : match.sets)
    : null;
  if (editing) {
    return (
      <div className="fx-row is-mine">
        <SetScoreForm
          player1Name={match.player1.name}
          player2Name={match.player2.name}
          initialSets={match.sets}
          onSubmit={(sets) => {
            onEditScore(sets);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          busy={busy}
          maxSets={maxSets}
          submitLabel="עדכן תוצאה"
        />
      </div>
    );
  }

  const mainRow = (
    <div className="fx-main">
      <span className="fx-name start">
        {leftLinkable ? (
          <Link to={`/players/${left.id}`} onClick={(e) => e.stopPropagation()} className="player-name-link">
            <span dir="auto" style={{ unicodeBidi: "isolate" }}>
              {left.name}
            </span>
          </Link>
        ) : (
          <span dir="auto" style={{ unicodeBidi: "isolate" }}>
            {left.name}
          </span>
        )}
      </span>
      <span className="fx-mid">
        {isDisputed ? (
          <span className="fx-sched-tag" dir="ltr">
            {match.void_reason === "not_played" ? t("המשחק לא בוצע") : t("DISPUTED")}
          </span>
        ) : isCompleted ? (
          correctionAcceptedFinal ? (
            <span className="fx-sched-tag bright" dir="ltr">
              {formatSets(leftSets)} · FINAL
            </span>
          ) : (
            <span className="score" dir="ltr">
              {formatSets(leftSets)}
            </span>
          )
        ) : isPendingConfirmation ? (
          iNeedToConfirm ? (
            <span className="state open">{t("לאישור")}</span>
          ) : iSentCorrectionPending ? (
            <span className="fx-sched-tag" dir="ltr">
              {formatSets(correctedLeftSets)} · SENT
            </span>
          ) : (
            <span className="state">{t("ממתין")}</span>
          )
        ) : mine && rowStatus ? (
          <span className={`fx-sched-tag${rowStatus === "asked_you" || rowStatus === "set" ? " bright" : ""}`} dir="ltr">
            {rowStatus === "no_time" ? FX_STATUS_TAG.no_time : `${formatWeekdayTime(new Date(match.scheduled_at))} · ${FX_STATUS_TAG[rowStatus]}`}
          </span>
        ) : mine ? (
          <span className="state open">{t("לשחק")}</span>
        ) : (
          <span className="dot" aria-hidden="true" />
        )}
      </span>
      <span className="fx-name end">
        {rightLinkable ? (
          <Link to={`/players/${right.id}`} onClick={(e) => e.stopPropagation()} className="player-name-link">
            <span dir="auto" style={{ unicodeBidi: "isolate" }}>
              {right.name}
            </span>
          </Link>
        ) : (
          <span dir="auto" style={{ unicodeBidi: "isolate" }}>
            {right.name}
          </span>
        )}
      </span>
    </div>
  );

  const rowClass = `fx-row${mine ? " is-mine" : ""}`;

  if (iNeedToConfirm) {
    return (
      <button type="button" className={rowClass} onClick={onNeedsConfirm}>
        {mainRow}
      </button>
    );
  }

  if (isCompleted && mine && !correctionAcceptedFinal) {
    return (
      <button type="button" className={rowClass} onClick={() => setEditing(true)}>
        {mainRow}
      </button>
    );
  }

  return (
    <div className={rowClass}>
      {mainRow}
      {mine && iSentCorrectionPending && (
        <div className="fx-actions">
          <span className="fx-secondary">{t("WAITING FOR HIM · THE MATCH DOES NOT COUNT YET")}</span>
        </div>
      )}
      {mine && correctionAcceptedFinal && (
        <div className="fx-actions">
          <span className="fx-secondary">{t("HE ACCEPTED YOUR CORRECTION · TABLE UPDATED")}</span>
        </div>
      )}
      {mine && isDisputed && (
        <div className="fx-dispute-block is-asked">
          {match.void_reason !== "not_played" && (
            <>
              <span className="fx-secondary" dir="ltr">
                YOU {formatSets(myDisputeSets)}
              </span>
              <span className="fx-secondary" dir="ltr">
                HIM {formatSets(theirDisputeSets)}
              </span>
            </>
          )}
          <span className="fx-secondary">{t("NOT COUNTED · NEITHER SIDE GETS THE WIN")}</span>
        </div>
      )}
      {mine && match.status === "pending" && onStartReport && !isReporting && (
        <div className={`fx-actions${rowStatus === "asked_you" ? " is-asked" : ""}`}>
          {rowStatus === "no_time" && (
            <Link to={`/matches/${match.id}/schedule`} className="fx-report">
              {t("קבע שעה")}
              <ChevronIcon aria-hidden="true" />
            </Link>
          )}
          {rowStatus === "sent" && (
            <span className="fx-secondary">
              {t("WAITING FOR HIM")} ·{" "}
              <button type="button" className="fx-cancel-link" onClick={onCancelSchedule} disabled={busy}>
                {t("CANCEL")}
              </button>
            </span>
          )}
          {rowStatus === "asked_you" && (
            <>
              <button type="button" className="fx-report" onClick={onQuickConfirmSchedule} disabled={busy}>
                {t("אשר")}
              </button>
              <button
                type="button"
                className="fx-secondary"
                onClick={() => navigate(`/matches/${match.id}/schedule`)}
              >
                {t("הצע שעה אחרת")}
              </button>
            </>
          )}
          {rowStatus === "set" && scheduleState === "ready" && (
            <button type="button" className="fx-report" onClick={onStartReport}>
              <span className="fx-dot" aria-hidden="true" />
              {t("דווח")}
            </button>
          )}
          {rowStatus === "set" && scheduleState === "confirmed_future" && match.court && (
            <span className="fx-secondary">{match.court}</span>
          )}
        </div>
      )}
      {mine && isReporting && scheduleState === "ready" && (
        <SetScoreForm
          player1Name={match.player1.name}
          player2Name={match.player2.name}
          onSubmit={onSubmitScore}
          onCancel={onCancelForm}
          onCancelMatch={onCancelMatch}
          busy={busy}
          maxSets={maxSets}
        />
      )}
    </div>
  );
}
