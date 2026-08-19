import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import ScheduleForm from "../ScheduleForm.jsx";
import Avatar from "../Avatar.jsx";
import ConfirmScoreSheet from "../ConfirmScoreSheet.jsx";
import RatingQuestionnaire from "../RatingQuestionnaire.jsx";
import { UserPlusIcon, CalendarIcon, ChevronIcon, SettingsIcon, PlusIcon } from "../Icons.jsx";
import {
  formatSets,
  roundDueDate,
  roundDueDateObj,
  nextSchedulePreview,
  matchScheduleState,
  formatDayMonthTime,
  activeRoundStatus,
  daysLeftPhrase,
  getActionCandidates,
  buildOpenAction,
} from "../matchUtils.js";
import { SkeletonPageHeader, SkeletonHeroStat, SkeletonStandingsTable } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";

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
  const [confirmSheetMatch, setConfirmSheetMatch] = useState(null);
  const [showAddRoundConfirm, setShowAddRoundConfirm] = useState(false);
  const [reportingMyMatch, setReportingMyMatch] = useState(false);
  const [schedulingMyMatch, setSchedulingMyMatch] = useState(false);
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

  async function handleConfirmScore(matchId) {
    setBusy(true);
    setError("");
    try {
      await api.confirmScore(leagueId, matchId);
      setConfirmSheetMatch(null);
      await loadAll();
      reloadOpenAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisputeScore(matchId, sets) {
    setBusy(true);
    setError("");
    try {
      await api.reportScore(leagueId, matchId, sets);
      setConfirmSheetMatch(null);
      await loadAll();
      reloadOpenAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleProposeSchedule(matchId, scheduledAt) {
    setBusy(true);
    setError("");
    try {
      await api.proposeSchedule(leagueId, matchId, scheduledAt);
      setSchedulingMyMatch(false);
      await loadAll();
      reloadOpenAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSchedule(matchId) {
    setBusy(true);
    setError("");
    try {
      await api.confirmSchedule(leagueId, matchId);
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
  const leaderName = standings[0]?.user.name ?? "";
  // A points tie at the bottom of the table still means "behind" even though
  // the win-count gap rounds to 0 — only rank 1 counts as actually leading.
  const winsBehindDisplay = Math.max(myWinsBehind, 1);
  const footLine =
    myRank === 1
      ? t("אתה מוביל · {n} מחזורים נותרו", { n: roundsToCreate })
      : winsBehindDisplay === 1
      ? t("ניצחון אחד מאחורי {name} · {n} מחזורים נותרו", { name: leaderName, n: roundsToCreate })
      : t("{count} ניצחונות מאחורי {name} · {n} מחזורים נותרו", {
          count: winsBehindDisplay,
          name: leaderName,
          n: roundsToCreate,
        });

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
      setConfirmSheetMatch(leagueOpenAction.match);
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
            {isCreator && (
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
            <div className="ms-slab">
              <div className="ms-cell">
                <div className="ms-label">{t("מקום")}</div>
                <div className="ms-big" dir="ltr">
                  {myRank !== null ? (
                    <>
                      <span className="n">{myRank}</span>
                      <span className="unit">/{members.length}</span>
                      {rankDelta !== 0 && (
                        <span className="delta">
                          {rankDelta > 0 ? "▲" : "▼"}
                          {Math.abs(rankDelta)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="n">–</span>
                  )}
                </div>
              </div>
              <div className="ms-cell">
                <div className="ms-label">{t("אחוז ניצחונות")}</div>
                <div className="ms-big" dir="ltr">
                  {myWinRate !== null ? (
                    <>
                      <span className="n">{myWinRate}</span>
                      <span className="unit">%</span>
                    </>
                  ) : (
                    <span className="n">–</span>
                  )}
                </div>
              </div>
              <div className="ms-cell">
                <div className="ms-label">{t("מאזן")}</div>
                <div className="ms-mid" dir="ltr">
                  <span className="n">{myStanding?.wins ?? 0}</span>
                  <span className="unit">W</span>
                  <span className="n dim">{myStanding?.losses ?? 0}</span>
                  <span className="unit dim">L</span>
                </div>
              </div>
              <div className="ms-cell">
                <div className="ms-label">{t("רצף")}</div>
                <div className="ms-mid" dir="ltr">
                  {myStreak > 0 ? (
                    <>
                      <span className="n">{myStreak}</span>
                      <span className="unit">{myLastWon ? "W" : "L"}</span>
                    </>
                  ) : (
                    <span className="n">–</span>
                  )}
                </div>
              </div>
              <div className="ms-slab-foot" dir="ltr">
                {footLine}
              </div>
            </div>

            {leagueOpenAction && (
              <div className="my-match-row" style={{ marginTop: 20 }}>
                <div className="my-match-body">
                  <div className="my-match-name">
                    {leagueOpenAction.match.round_number != null && (
                      <>{t("מחזור {n}", { n: leagueOpenAction.match.round_number })} · </>
                    )}
                    <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                      {leagueActionOpponent?.name}
                    </span>
                  </div>
                  <div className="my-match-h2h">{leagueActionSub}</div>
                </div>
                <button type="button" className="my-match-report" onClick={handleOpenLeagueAction}>
                  <span className="my-match-dot" aria-hidden="true" />
                  {leagueActionBtnLabel}
                </button>
              </div>
            )}

            <div className="ms-label ms-rounds-label">{t("מחזור אחרי מחזור")}</div>
            {myRoundRows.length > 0 ? (
              <div className="my-stats-rounds">
                {myRoundRows.map((r) => (
                  <div className="my-stats-round" key={r.round}>
                    <span className="my-stats-round-num" dir="ltr">
                      {r.round}
                    </span>
                    <div className="my-stats-round-name">{r.opponentName}</div>
                    {r.status === "completed" ? (
                      <>
                        <span className="my-stats-round-score" dir="ltr">
                          {formatSets(r.mySets)}
                        </span>
                        <span className={`my-stats-round-badge${r.won ? " win" : ""}`}>
                          {r.won ? "W" : "L"}
                        </span>
                      </>
                    ) : r.status === "pending_confirmation" ? (
                      <span className="my-stats-round-state">{t("ממתין לאישור")}</span>
                    ) : (
                      <span className="my-stats-round-state open">{t("לשחק")}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">{t("עוד לא שובצו לך משחקים בליגה הזו")}</p>
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
            {standings.length > 0 && (
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
                    <Link to={`/head-to-head/${row.user.id}`} className={cls} key={row.user.id}>
                      {body}
                    </Link>
                  );
                })}
              </div>
            )}

            {standings.length > 0 && (
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
                        isScheduling={schedulingMyMatch}
                        onStartReport={() => setReportingMyMatch(true)}
                        onStartSchedule={() => setSchedulingMyMatch(true)}
                        onConfirmSchedule={() => handleConfirmSchedule(match.id)}
                        onSubmitScore={(sets) => {
                          handleReportScore(match.id, sets);
                          setReportingMyMatch(false);
                        }}
                        onSubmitSchedule={(scheduledAt) => handleProposeSchedule(match.id, scheduledAt)}
                        onCancelForm={() => {
                          setReportingMyMatch(false);
                          setSchedulingMyMatch(false);
                        }}
                        onCancelMatch={() => handleCancelMatch(match.id)}
                        onEditScore={(sets) => handleReportScore(match.id, sets)}
                        onNeedsConfirm={() => setConfirmSheetMatch(match)}
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
                          isScheduling={false}
                          onEditScore={(sets) => handleReportScore(match.id, sets)}
                          onNeedsConfirm={() => setConfirmSheetMatch(match)}
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

      {confirmSheetMatch && user && (
        <ConfirmScoreSheet
          match={confirmSheetMatch}
          currentUserId={user.id}
          busy={busy}
          onConfirm={() => handleConfirmScore(confirmSheetMatch.id)}
          onDispute={(sets) => handleDisputeScore(confirmSheetMatch.id, sets)}
          onClose={() => setConfirmSheetMatch(null)}
          maxSets={league.best_of}
        />
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


function FixtureRow({
  match,
  userId,
  busy,
  isReporting,
  isScheduling,
  onStartReport,
  onStartSchedule,
  onConfirmSchedule,
  onSubmitScore,
  onSubmitSchedule,
  onCancelForm,
  onCancelMatch,
  onEditScore,
  onNeedsConfirm,
  maxSets,
}) {
  const [editing, setEditing] = useState(false);
  const { t } = useLanguage();

  const mine = match.player1.id === userId || match.player2.id === userId;
  const isCompleted = match.status === "completed";
  const isPendingConfirmation = match.status === "pending_confirmation";
  const iNeedToConfirm = isPendingConfirmation && mine && match.reported_by !== userId;
  const scheduleState = mine && onStartSchedule ? matchScheduleState(match, userId) : null;

  // In my row I'm always on the "start" side, so my row doesn't jump around
  // between rounds; the score/result is shown from that side's perspective.
  const [left, right] =
    mine && match.player2.id === userId ? [match.player2, match.player1] : [match.player1, match.player2];
  const leftIsPlayer1 = left.id === match.player1.id;
  const leftSets = isCompleted
    ? leftIsPlayer1
      ? match.sets
      : match.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }))
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
        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
          {left.name}
        </span>
      </span>
      <span className="fx-mid">
        {isCompleted ? (
          <span className="score" dir="ltr">
            {formatSets(leftSets)}
          </span>
        ) : isPendingConfirmation ? (
          iNeedToConfirm ? (
            <span className="state open">{t("לאישור")}</span>
          ) : (
            <span className="state">{t("ממתין")}</span>
          )
        ) : mine ? (
          <span className="state open">{t("לשחק")}</span>
        ) : (
          <span className="dot" aria-hidden="true" />
        )}
      </span>
      <span className="fx-name end">
        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
          {right.name}
        </span>
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

  if (isCompleted && mine) {
    return (
      <button type="button" className={rowClass} onClick={() => setEditing(true)}>
        {mainRow}
      </button>
    );
  }

  return (
    <div className={rowClass}>
      {mainRow}
      {mine && match.status === "pending" && onStartReport && !isScheduling && !isReporting && (
        <div className="fx-actions">
          {scheduleState === "unscheduled" && (
            <button type="button" className="fx-report" onClick={onStartSchedule}>
              <span className="fx-dot" aria-hidden="true" />
              {t("הצע שעה")}
            </button>
          )}
          {scheduleState === "proposed_by_me" && (
            <span className="fx-secondary">{t("ממתין לאישור שעה")}</span>
          )}
          {scheduleState === "proposed_by_them" && (
            <>
              <button type="button" className="fx-report" onClick={onConfirmSchedule} disabled={busy}>
                <span className="fx-dot" aria-hidden="true" />
                {t("אשר שעה")}
              </button>
              <button type="button" className="fx-secondary" onClick={onStartSchedule}>
                {t("הצע שעה")}
              </button>
            </>
          )}
          {scheduleState === "confirmed_future" && (
            <span className="fx-secondary">
              {t("מתוזמן ל-{datetime}", { datetime: formatDayMonthTime(new Date(match.scheduled_at)) })}
            </span>
          )}
          {scheduleState === "ready" && (
            <button type="button" className="fx-report" onClick={onStartReport}>
              <span className="fx-dot" aria-hidden="true" />
              {t("דווח")}
            </button>
          )}
        </div>
      )}
      {mine && isScheduling && (
        <ScheduleForm busy={busy} onSubmit={onSubmitSchedule} onCancel={onCancelForm} />
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
