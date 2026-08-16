import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import Avatar from "../Avatar.jsx";
import WaitingConfirmationCard from "../WaitingConfirmationCard.jsx";
import ConfirmScoreSheet from "../ConfirmScoreSheet.jsx";
import { UserPlusIcon, CalendarIcon, ChevronIcon, GearIcon, PlusIcon } from "../Icons.jsx";
import {
  formatSets,
  roundDueDate,
  leagueRuleLabels,
  nextSchedulePreview,
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
  const [myH2h, setMyH2h] = useState(null);
  const [reportingMyMatch, setReportingMyMatch] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [selectedRound, setSelectedRound] = useState(null);
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
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, user]);

  async function handleJoin(codeOverride) {
    setBusy(true);
    setError("");
    try {
      await api.joinLeague(leagueId, codeOverride ?? codeFromLink);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!user || !league || isMember || !codeFromLink || autoJoinAttempted.current) return;
    autoJoinAttempted.current = true;
    handleJoin(codeFromLink);
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
  const myMatchInShownRound = matches.find((m) => m.round_number === shownRound);
  const shownOpponent = myMatchInShownRound
    ? myMatchInShownRound.player1.id === user?.id
      ? myMatchInShownRound.player2
      : myMatchInShownRound.player1
    : null;

  useEffect(() => {
    if (!shownOpponent) {
      setMyH2h(null);
      return;
    }
    api
      .headToHead(shownOpponent.id)
      .then(setMyH2h)
      .catch(() => setMyH2h(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownOpponent?.id]);

  if (!league) {
    return (
      <div>
        <SkeletonPageHeader />
        <div className="section-tabs">
          <span className="section-tab active">{t("טבלת דירוג")}</span>
        </div>
        <SkeletonHeroStat />
        <div style={{ marginTop: 20 }}>
          <SkeletonStandingsTable />
        </div>
      </div>
    );
  }

  const isCreator = league.created_by === user?.id;
  const myPendingConfirmationMatch =
    myMatchInShownRound?.status === "pending_confirmation" ? myMatchInShownRound : null;
  const iAmReporter = myPendingConfirmationMatch?.reported_by === user?.id;
  const myShownMatchCompleted = myMatchInShownRound?.status === "completed" ? myMatchInShownRound : null;
  const myShownIAmPlayer1 = myShownMatchCompleted && myShownMatchCompleted.player1.id === user?.id;
  const myShownP1Won =
    myShownMatchCompleted && myShownMatchCompleted.player1_score > myShownMatchCompleted.player2_score;
  const myShownIWon = myShownMatchCompleted && (myShownIAmPlayer1 ? myShownP1Won : !myShownP1Won);
  const myShownSets = myShownMatchCompleted
    ? myShownIAmPlayer1
      ? myShownMatchCompleted.sets
      : myShownMatchCompleted.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }))
    : null;
  const myStanding = standings.find((row) => row.user.id === user?.id);
  const myWinRate =
    myStanding && myStanding.played > 0 ? Math.round((myStanding.wins / myStanding.played) * 100) : null;
  const myRankIndex = standings.findIndex((row) => row.user.id === user?.id);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;
  const leagueFormStrip = matches
    .filter((m) => m.status === "completed")
    .slice()
    .sort((a, b) => new Date(b.played_at || b.created_at) - new Date(a.played_at || a.created_at))
    .slice(0, 8)
    .map((m) => {
      const iAmPlayer1 = m.player1.id === user?.id;
      const myScore = iAmPlayer1 ? m.player1_score : m.player2_score;
      const opponentScore = iAmPlayer1 ? m.player2_score : m.player1_score;
      return { won: myScore > opponentScore };
    });
  const ruleLabels = leagueRuleLabels(league, t);
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
  const shownRoundPlayed = shownRoundMatches.filter((m) => m.status !== "pending");
  const shownRoundCloses = shownRound
    ? roundDueDate(league.schedule_started_at, shownRound, league.round_length_days)
    : "";
  const prevRound = existingRoundNumbers.filter((r) => r < shownRound).sort((a, b) => b - a)[0] ?? null;
  const nextRoundNav = existingRoundNumbers.filter((r) => r > shownRound).sort((a, b) => a - b)[0] ?? null;
  const legacyMatches = allMatches.filter((m) => !m.round_number);

  return (
    <div>
      <header className="page-head">
        <Link to="/leagues" className="back-link">
          <ChevronIcon aria-hidden="true" />
          {t("חזרה לליגות")}
        </Link>

        <div className="page-title-row">
          <h1>{league.name}</h1>
          <div className="page-title-actions">
            <PageHelp
              pageKey="leagueDetail"
              title="עמוד הליגה"
              text="כאן תראו את טבלת הדירוג, את המשחקים שלכם ושל שאר חברי הליגה, ואת הסטטיסטיקה האישית שלכם בליגה הזו."
            />
            {isCreator && (
              <Link to={`/leagues/${leagueId}/manage`} className="manage-league-btn" aria-label={t("ניהול הליגה")}>
                <GearIcon aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
        <div className="league-detail-meta-row">
          <span className="league-detail-meta-text">
            {[
              t(league.sport?.name),
              `${members.length} ${t("שחקנים")}`,
              ruleLabels.bestOfLabel,
              ruleLabels.frequencyLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {isMember && !isCreator && (
            <button
              type="button"
              className="league-leave-chip"
              onClick={() => setShowLeaveConfirm(true)}
            >
              {t("יציאה מהליגה")}
            </button>
          )}
        </div>
      </header>

      <div className="league-detail-actions">
        {!isMember && user && (league.is_open || codeFromLink) && (
          <button className="btn-primary" onClick={() => handleJoin()} disabled={busy}>
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

      <div className="section-tabs">
        {isMember && (
          <button
            type="button"
            className={`section-tab${activeTab === "stats" ? " active" : ""}`}
            onClick={() => setActiveTab("stats")}
          >
            {t("הסטטיסטיקה שלי")}
          </button>
        )}
        <button
          type="button"
          className={`section-tab${activeTab === "standings" ? " active" : ""}`}
          onClick={() => setActiveTab("standings")}
        >
          {t("טבלת דירוג")}
        </button>
        <button
          type="button"
          className={`section-tab${activeTab === "matches" ? " active" : ""}`}
          onClick={() => setActiveTab("matches")}
        >
          {t("משחקים")}
        </button>
      </div>

      <div>
        {activeTab === "stats" && isMember && myStanding && (
          <div className="league-stats-summary">
            <div className="profile-winrate-row">
              <div className="profile-winrate-value" dir="ltr">
                <span className="profile-winrate-number">{myWinRate !== null ? myWinRate : "–"}</span>
                <span className="profile-winrate-percent">%</span>
              </div>
              <div className="profile-winrate-label">
                <div className="profile-winrate-title">{t("אחוז ניצחונות")}</div>
                <div className="profile-winrate-record" dir="ltr">
                  {myStanding.wins}W · {myStanding.losses}L
                </div>
              </div>
            </div>

            {leagueFormStrip.length > 0 && (
              <>
                <div className="profile-form-strip">
                  {leagueFormStrip.map((m, i) => (
                    <span key={i} className={`profile-form-bar${m.won ? " win" : ""}`} />
                  ))}
                </div>
                <div className="profile-form-caption">
                  {leagueFormStrip.length} {t("המשחקים האחרונים")}
                </div>
              </>
            )}

            <div className="league-stat-tiles">
              <div className="league-stat-tile rank">
                <div className="league-stat-tile-label">{t("דירוג")}</div>
                <div className="league-stat-tile-value" dir="ltr">
                  {myRank !== null ? `#${myRank}` : "–"}
                </div>
              </div>
              <div className="league-stat-tile">
                <div className="league-stat-tile-label">{t("נקודות")}</div>
                <div className="league-stat-tile-value">{myStanding.points}</div>
              </div>
              <div className="league-stat-tile">
                <div className="league-stat-tile-label">{t("משחקים")}</div>
                <div className="league-stat-tile-value">{myStanding.played}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "standings" && (
          <div className="table-wrap">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="player-col">{t("שחקן")}</th>
                  <th>{t("משחקים")}</th>
                  <th>{t("נצחונות")}</th>
                  <th>{t("הפסדים")}</th>
                  <th>{t("נקודות")}</th>
                </tr>
              </thead>
              <tbody>
                {standings.flatMap((row, index) => {
                  const rank = index + 1;
                  const isMe = row.user.id === user?.id;
                  const rows = [];
                  if (index === 3 && standings.length > 3) {
                    rows.push(
                      <tr key="zone-podium" className="standings-zone-row podium">
                        <td colSpan={6}>
                          <div className="standings-zone-divider">
                            <span className="standings-zone-label">{t("פודיום")}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  if (standings.length >= 6 && index === standings.length - 2) {
                    rows.push(
                      <tr key="zone-relegation" className="standings-zone-row relegation">
                        <td colSpan={6}>
                          <div className="standings-zone-divider">
                            <span className="standings-zone-label">{t("אזור הירידה")}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  rows.push(
                    <tr key={row.user.id} className={isMe ? "me-row" : undefined}>
                      <td>
                        <span className={`rank-badge${rank <= 3 ? ` rank-${rank}` : ""}`}>{rank}</span>
                      </td>
                      <td className="player-col">
                        {isMe ? (
                          row.user.name
                        ) : (
                          <Link to={`/head-to-head/${row.user.id}`} className="standings-player-link">
                            {row.user.name}
                            <ChevronIcon className="standings-player-chevron chevron-icon" aria-hidden="true" />
                          </Link>
                        )}
                      </td>
                      <td>{row.played}</td>
                      <td>{row.wins}</td>
                      <td>{row.losses}</td>
                      <td>{row.points}</td>
                    </tr>
                  );
                  return rows;
                })}
              </tbody>
            </table>
            {standings.length > 0 && (
              <p className="standings-hint">{t("הקשה על שחקן פותחת ראש בראש מולו")}</p>
            )}
          </div>
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
                <div className="round-nav">
                  <div className="round-nav-text">
                    <div className="round-nav-label">{t("מחזור")}</div>
                    <div className="round-nav-sub" dir="ltr">
                      <span className="num">
                        {t("{played}/{total} שוחקו", {
                          played: shownRoundPlayed.length,
                          total: shownRoundMatches.length,
                        })}
                      </span>
                      {shownRoundCloses && (
                        <span className="num">
                          {" "}
                          ·{" "}
                          {isLatestRound
                            ? t("נסגר ב-{date}", { date: shownRoundCloses })
                            : t("נסגר ב-{date} (עבר)", { date: shownRoundCloses })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="round-nav-controls">
                    <button
                      type="button"
                      className="round-nav-arrow"
                      disabled={prevRound === null}
                      onClick={() => setSelectedRound(prevRound)}
                      aria-label={t("מחזור קודם")}
                    >
                      <ChevronIcon aria-hidden="true" />
                    </button>
                    <span className={`round-nav-number${isLatestRound ? " active" : ""}`} dir="ltr">
                      {shownRound}
                    </span>
                    <button
                      type="button"
                      className="round-nav-arrow next"
                      disabled={nextRoundNav === null}
                      onClick={() => setSelectedRound(nextRoundNav)}
                      aria-label={t("מחזור הבא")}
                    >
                      <ChevronIcon aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="round-nav-bar">
                  <div
                    className={`round-nav-bar-fill${isLatestRound ? "" : " past"}`}
                    style={{
                      width: shownRoundMatches.length
                        ? `${Math.max((shownRoundPlayed.length / shownRoundMatches.length) * 100, 2)}%`
                        : "0%",
                    }}
                  />
                </div>

                {isMember && myMatchInShownRound && myMatchInShownRound.status === "pending" && (
                  <>
                    <div className="my-match-row">
                      <Avatar name={shownOpponent.name} size={38} />
                      <div className="my-match-body">
                        <div className="my-match-name">{shownOpponent.name}</div>
                        {myH2h && (
                          <div className="my-match-h2h" dir="ltr">
                            H2H {myH2h.wins}-{myH2h.losses}
                          </div>
                        )}
                      </div>
                      {!reportingMyMatch && (
                        <button
                          type="button"
                          className="my-match-report"
                          onClick={() => setReportingMyMatch(true)}
                        >
                          <span className="my-match-dot" aria-hidden="true" />
                          {t("דווח")}
                        </button>
                      )}
                    </div>
                    {reportingMyMatch && (
                      <SetScoreForm
                        player1Name={myMatchInShownRound.player1.name}
                        player2Name={myMatchInShownRound.player2.name}
                        onSubmit={(sets) => {
                          handleReportScore(myMatchInShownRound.id, sets);
                          setReportingMyMatch(false);
                        }}
                        onCancel={() => setReportingMyMatch(false)}
                        busy={busy}
                        maxSets={league.best_of}
                      />
                    )}
                    <button
                      type="button"
                      className="link-btn my-match-cancel"
                      onClick={() => handleCancelMatch(myMatchInShownRound.id)}
                    >
                      {t("בטל משחק")}
                    </button>
                  </>
                )}

                {isMember && myPendingConfirmationMatch && (
                  <div className="my-match-pending-wrap">
                    {iAmReporter ? (
                      <WaitingConfirmationCard
                        match={myPendingConfirmationMatch}
                        currentUserId={user.id}
                        leagueId={leagueId}
                        onSubmit={(sets) => handleReportScore(myPendingConfirmationMatch.id, sets)}
                        maxSets={league.best_of}
                      />
                    ) : (
                      <button
                        type="button"
                        className="needs-confirm-banner"
                        onClick={() => setConfirmSheetMatch(myPendingConfirmationMatch)}
                      >
                        <span className="needs-confirm-dot" />
                        <span className="needs-confirm-text">{t("יש לך תוצאה לאישור")}</span>
                        <ChevronIcon aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}

                {isMember && myShownMatchCompleted && (
                  <div className="my-match-row">
                    <Avatar name={shownOpponent.name} size={38} />
                    <div className="my-match-body">
                      <div className="my-match-name">{shownOpponent.name}</div>
                      {myH2h && (
                        <div className="my-match-h2h" dir="ltr">
                          H2H {myH2h.wins}-{myH2h.losses}
                        </div>
                      )}
                    </div>
                    <div className="my-match-result">
                      <span dir="ltr">{formatSets(myShownSets)}</span>
                      <span className={`match-result-badge ${myShownIWon ? "win" : "loss"}`}>
                        {myShownIWon ? "W" : "L"}
                      </span>
                    </div>
                  </div>
                )}

                {isMember && !myMatchInShownRound && (
                  <div className="my-match-none">{t("אין לך משחק במחזור הזה")}</div>
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

                <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
                  <span>{t("כל המשחקים במחזור {n}", { n: shownRound })}</span>
                </div>
                <div className="all-matches-list">
                  {shownRoundMatches.map((match) => (
                    <AllMatchesRow
                      key={match.id}
                      match={match}
                      currentUserId={user.id}
                      onReport={handleReportScore}
                      onNeedsConfirm={() => setConfirmSheetMatch(match)}
                      busy={busy}
                      maxSets={league.best_of}
                    />
                  ))}
                </div>

                {existingRoundNumbers.length > 0 && (
                  <Link to={`/leagues/${leagueId}/rounds`} className="league-action-row">
                    <div>
                      <span className="league-action-title">{t("כל המחזורים")}</span>
                      <span className="league-action-subtitle">
                        {t("{rounds} מחזורים · {games} משחקים", {
                          rounds: existingRoundNumbers.length,
                          games: allMatches.length,
                        })}
                      </span>
                    </div>
                    <ChevronIcon className="league-action-chevron chevron-icon" aria-hidden="true" />
                  </Link>
                )}

                {legacyMatches.length > 0 && (
                  <div>
                    <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
                      <span>{t("משחקים ללא מחזור")}</span>
                    </div>
                    <div className="all-matches-list">
                      {legacyMatches.map((match) => (
                        <AllMatchesRow
                          key={match.id}
                          match={match}
                          currentUserId={user.id}
                          onReport={handleReportScore}
                          onNeedsConfirm={() => setConfirmSheetMatch(match)}
                          busy={busy}
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


function AllMatchesRow({ match, currentUserId, onReport, onNeedsConfirm, busy, maxSets }) {
  const [editing, setEditing] = useState(false);
  const { t } = useLanguage();
  const isCompleted = match.status === "completed";
  const isPendingConfirmation = match.status === "pending_confirmation";
  const p1Won = isCompleted && match.player1_score > match.player2_score;
  const iAmPlayer1 = match.player1.id === currentUserId;
  const isMine = match.player1.id === currentUserId || match.player2.id === currentUserId;
  const iNeedToConfirm = isPendingConfirmation && isMine && match.reported_by !== currentUserId;
  const iWon = isCompleted && (iAmPlayer1 ? p1Won : !p1Won);
  const mySets = iAmPlayer1
    ? match.sets
    : match.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));

  const meIsPlayer1 = isMine && iAmPlayer1;
  const meIsPlayer2 = isMine && !iAmPlayer1;

  if (editing) {
    return (
      <div className="match-row match-row-editing">
        <SetScoreForm
          player1Name={match.player1.name}
          player2Name={match.player2.name}
          initialSets={match.sets}
          onSubmit={(sets) => {
            onReport(match.id, sets);
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

  const row = (
    <>
      <span className="match-row-names">
        <span className={meIsPlayer1 ? "me" : undefined}>{match.player1.name}</span>
        <span className="match-row-sep"> · </span>
        <span className={meIsPlayer2 ? "me" : undefined}>{match.player2.name}</span>
      </span>
      {isPendingConfirmation ? (
        iNeedToConfirm ? (
          <span className="match-row-confirm">{t("לאישור")}</span>
        ) : (
          <span className="match-row-dot" aria-label={t("ממתין")} />
        )
      ) : !isCompleted ? (
        <span className="match-row-dot" aria-label={t("ממתין")} />
      ) : (
        <span className={`match-row-score${iWon ? " win" : ""}`} dir="ltr">
          {formatSets(mySets)}
        </span>
      )}
    </>
  );

  if (iNeedToConfirm) {
    return (
      <button
        type="button"
        className={`match-row match-row-editable${isMine ? " mine" : ""}`}
        onClick={onNeedsConfirm}
      >
        {row}
      </button>
    );
  }

  if (isCompleted && isMine) {
    return (
      <button type="button" className="match-row match-row-editable mine" onClick={() => setEditing(true)}>
        {row}
      </button>
    );
  }

  return <div className={`match-row${isMine ? " mine" : ""}`}>{row}</div>;
}
