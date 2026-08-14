import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import NextMatchRow from "../NextMatchRow.jsx";
import CircularGauge from "../CircularGauge.jsx";
import WaitingConfirmationCard from "../WaitingConfirmationCard.jsx";
import ConfirmScoreSheet from "../ConfirmScoreSheet.jsx";
import { UserPlusIcon, CalendarIcon, ChevronIcon } from "../Icons.jsx";
import EmptyState from "../EmptyState.jsx";
import { formatSets, formatWeekShort, currentRoundNumber, roundDueDate } from "../matchUtils.js";
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
  const autoJoinAttempted = useRef(false);
  const initialTabSet = useRef(false);

  const isMember = members.some((m) => m.id === user?.id);

  useEffect(() => {
    if (!league) return;
    if (!initialTabSet.current) {
      initialTabSet.current = true;
      if (isMember) setActiveTab("stats");
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

  async function handleUpdateRules(rules) {
    await api.updateLeagueRules(leagueId, rules);
    await loadAll();
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

  async function handleDeleteLeague() {
    if (
      !window.confirm(
        t('למחוק את הליגה "{name}"? הפעולה תמחק גם את כל המשחקים והחברויות בה, ולא ניתנת לביטול.', {
          name: league.name,
        })
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.deleteLeague(leagueId);
      navigate("/leagues");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function handleLeaveLeague() {
    if (!window.confirm(t('לעזוב את הליגה "{name}"?', { name: league.name }))) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.leaveLeague(leagueId);
      navigate("/leagues");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

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
  const myNextMatch = matches
    .filter((m) => m.status === "pending")
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
  const myPendingConfirmationMatch = matches.find((m) => m.status === "pending_confirmation");
  const iAmReporter = myPendingConfirmationMatch?.reported_by === user?.id;
  const myStanding = standings.find((row) => row.user.id === user?.id);
  const myWinRate =
    myStanding && myStanding.played > 0 ? Math.round((myStanding.wins / myStanding.played) * 100) : null;
  const round = currentRoundNumber(league.schedule_started_at, league.round_length_days);

  return (
    <div>
      <header className="page-head">
        <Link to="/leagues" className="back-link">
          <ChevronIcon aria-hidden="true" />
          {t("חזרה לליגות")}
        </Link>

        <div className="page-title-row">
          <h1>{league.name}</h1>
          <PageHelp
            pageKey="leagueDetail"
            title="עמוד הליגה"
            text="כאן תראו את טבלת הדירוג, את המשחקים שלכם ושל שאר חברי הליגה, ואת הסטטיסטיקה האישית שלכם בליגה הזו."
          />
        </div>
        <div className="league-detail-meta">
          {[t(league.sport?.name), `${members.length} ${t("שחקנים")}`, round ? formatWeekShort(round, t) : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {league.description && <p className="muted">{league.description}</p>}
      </header>

      <LeagueRules league={league} isCreator={isCreator} onUpdate={handleUpdateRules} t={t} />

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
        {isCreator && (
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleGenerateSchedule}
            disabled={busy}
          >
            {busy ? t("יוצר...") : t("צור לוח משחקים")}
          </button>
        )}
        {isMember && !isCreator && (
          <button
            type="button"
            className="btn-secondary btn-small"
            style={{ color: "var(--danger)" }}
            onClick={handleLeaveLeague}
            disabled={busy}
          >
            {t("עזיבת ליגה")}
          </button>
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
        {activeTab === "stats" && isMember && (
          <>
            {myNextMatch && (
              <div style={{ marginBottom: myStanding ? 24 : 0 }}>
                <h2>{t("המשחק הבא שלך")}</h2>
                <ul className="match-list">
                  <NextMatchRow
                    match={myNextMatch}
                    currentUserId={user.id}
                    onSubmit={(sets) => handleReportScore(myNextMatch.id, sets)}
                    busy={busy}
                    maxSets={league.best_of}
                  />
                </ul>
              </div>
            )}
            {myStanding && (
              <div className="hero-stat">
                <CircularGauge
                  value={myStanding.wins}
                  max={Math.max(myStanding.played, 1)}
                  size={92}
                  strokeWidth={8}
                >
                  <div className="gauge-value">{myWinRate !== null ? `${myWinRate}%` : "–"}</div>
                  <div className="gauge-caption">{t("ניצחונות")}</div>
                </CircularGauge>
                <div className="hero-copy">
                  <span className="eyebrow">{t("הסטטיסטיקה שלי בליגה")}</span>
                  <div className="chip-row">
                    <span className="chip">
                      {myStanding.points} {t("נקודות")}
                    </span>
                    <span className="chip">
                      {myStanding.losses} {t("הפסדים")}
                    </span>
                    <span className="chip">
                      {myStanding.played} {t("משחקים")}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
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
                      <td className="player-col">{row.user.name}</td>
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
          </div>
        )}

        {activeTab === "matches" && (
          <div className="league-matches-tab">
            {isMember && (myNextMatch || myPendingConfirmationMatch) && (
              <div>
                <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
                  <span>
                    {[t("המשחק שלי"), round ? formatWeekShort(round, t) : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {myNextMatch ? (
                  <MyMatchCard
                    match={myNextMatch}
                    currentUserId={user.id}
                    dueDate={round ? roundDueDate(league.schedule_started_at, round, league.round_length_days) : ""}
                    onSubmit={(sets) => handleReportScore(myNextMatch.id, sets)}
                    onCancel={() => handleCancelMatch(myNextMatch.id)}
                    busy={busy}
                    maxSets={league.best_of}
                  />
                ) : iAmReporter ? (
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

            {allMatches.length === 0 && (
              <EmptyState icon={<CalendarIcon aria-hidden="true" />}>
                {t("עדיין אין משחקים בליגה.")}
              </EmptyState>
            )}
            {groupMatchesByRound(allMatches).map(({ round: r, matches: roundMatches }) => (
              <div key={r}>
                <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
                  {r === "none" ? (
                    <span>{t("כל המשחקים")}</span>
                  ) : (
                    <Link to={`/leagues/${leagueId}/rounds/${r}`} className="round-header-link">
                      {[t("כל המשחקים"), formatWeekShort(r, t)].join(" · ")}
                      <ChevronIcon aria-hidden="true" />
                    </Link>
                  )}
                </div>
                <div className="all-matches-list">
                  {roundMatches.map((match) => (
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
            ))}
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

      {user?.is_admin && (
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          <h2>{t("ניהול ליגה")}</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            {t("מחיקת הליגה תסיר לצמיתות את כל המשחקים והחברויות בה.")}
          </p>
          <button
            type="button"
            className="link-btn"
            style={{ color: "var(--danger)" }}
            onClick={handleDeleteLeague}
            disabled={busy}
          >
            {t("מחק ליגה")}
          </button>
        </div>
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
    </div>
  );
}


function LeagueRules({ league, isCreator, onUpdate, t }) {
  const [editing, setEditing] = useState(false);
  const [bestOf, setBestOf] = useState(league.best_of);
  const [roundLengthDays, setRoundLengthDays] = useState(league.round_length_days);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function openEditor() {
    setBestOf(league.best_of);
    setRoundLengthDays(league.round_length_days);
    setError("");
    setEditing(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onUpdate({ best_of: bestOf, round_length_days: roundLengthDays });
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const bestOfLabels = { 1: t("עד סט אחד"), 3: t("עד 3 סטים"), 5: t("עד 5 סטים") };
  const bestOfLabel = bestOfLabels[league.best_of] || bestOfLabels[3];
  const frequencyLabel = league.round_length_days === 14 ? t("דו-שבועי") : t("שבועי");

  if (!editing) {
    return (
      <div className="league-rules">
        <div className="league-rules-row">
          <span className="league-rules-label">{t("פורמט משחק")}</span>
          <span className="league-rules-value">{bestOfLabel}</span>
        </div>
        <div className="league-rules-row">
          <span className="league-rules-label">{t("תדירות לוח משחקים")}</span>
          <span className="league-rules-value">{frequencyLabel}</span>
        </div>
        {isCreator && (
          <button type="button" className="league-rules-edit" onClick={openEditor}>
            {t("ערוך חוקים")}
          </button>
        )}
      </div>
    );
  }

  return (
    <form className="league-rules-form" onSubmit={handleSubmit}>
      <label>
        {t("פורמט משחק")}
        <select value={bestOf} onChange={(e) => setBestOf(Number(e.target.value))}>
          <option value={1}>{t("עד סט אחד")}</option>
          <option value={3}>{t("עד 3 סטים")}</option>
          <option value={5}>{t("עד 5 סטים")}</option>
        </select>
      </label>
      <label>
        {t("תדירות לוח משחקים")}
        <select value={roundLengthDays} onChange={(e) => setRoundLengthDays(Number(e.target.value))}>
          <option value={7}>{t("שבועי")}</option>
          <option value={14}>{t("דו-שבועי")}</option>
        </select>
      </label>
      {error && <p className="error">{t(error)}</p>}
      <div className="inline-form">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? t("שומר...") : t("שמור")}
        </button>
        <button type="button" className="link-btn" onClick={() => setEditing(false)}>
          {t("ביטול")}
        </button>
      </div>
    </form>
  );
}

function MyMatchCard({ match, currentUserId, dueDate, onSubmit, onCancel, busy, maxSets }) {
  const { t } = useLanguage();
  const iAmPlayer1 = match.player1.id === currentUserId;
  const opponent = iAmPlayer1 ? match.player2 : match.player1;

  return (
    <div className="my-match-card">
      <div className="my-match-top">
        <Link to={`/head-to-head/${opponent.id}`} className="my-match-name">
          {t("מול {name}", { name: opponent.name })}
        </Link>
        {dueDate && <span className="my-match-due">{t("עד {date}", { date: dueDate })}</span>}
      </div>
      <SetScoreForm
        player1Name={match.player1.name}
        player2Name={match.player2.name}
        onSubmit={onSubmit}
        onCancel={onCancel}
        busy={busy}
        maxSets={maxSets}
      />
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

  if (editing) {
    return (
      <div className="all-matches-row all-matches-row-editing">
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
      <span className="all-matches-names">
        <span className={isCompleted ? (p1Won ? "winner" : "loser") : "strong"}>{match.player1.name}</span>{" "}
        <span className="vs-label">vs</span>{" "}
        <span className={isCompleted ? (p1Won ? "loser" : "winner") : "strong"}>{match.player2.name}</span>
      </span>
      {isPendingConfirmation ? (
        <span className={`pill-pending${iNeedToConfirm ? " needs-confirm" : ""}`}>
          {iNeedToConfirm ? t("לאישור") : t("ממתין")}
        </span>
      ) : !isCompleted ? (
        <span className="pill-pending">{t("ממתין")}</span>
      ) : (
        <span className={`all-matches-score${iWon ? " win" : ""}`} dir="ltr">
          {formatSets(mySets)}
        </span>
      )}
    </>
  );

  if (iNeedToConfirm) {
    return (
      <button type="button" className="all-matches-row all-matches-row-editable" onClick={onNeedsConfirm}>
        {row}
      </button>
    );
  }

  if (isCompleted && isMine) {
    return (
      <button type="button" className="all-matches-row all-matches-row-editable" onClick={() => setEditing(true)}>
        {row}
      </button>
    );
  }

  return <div className="all-matches-row">{row}</div>;
}
