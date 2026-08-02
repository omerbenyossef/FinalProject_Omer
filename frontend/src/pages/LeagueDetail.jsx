import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import NextMatchRow from "../NextMatchRow.jsx";
import CircularGauge from "../CircularGauge.jsx";
import { UserPlusIcon, CalendarIcon } from "../Icons.jsx";
import EmptyState from "../EmptyState.jsx";
import { formatSets, formatWeekLabel } from "../matchUtils.js";
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
  const [showMatches, setShowMatches] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("standings");
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
  const myStanding = standings.find((row) => row.user.id === user?.id);
  const myWinRate =
    myStanding && myStanding.played > 0 ? Math.round((myStanding.wins / myStanding.played) * 100) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title-row">
            <h1>{league.name}</h1>
            <PageHelp
              pageKey="leagueDetail"
              title="עמוד הליגה"
              text="כאן תראו את טבלת הדירוג, את המשחקים שלכם ושל שאר חברי הליגה, ואת הסטטיסטיקה האישית שלכם בליגה הזו."
            />
          </div>
          {league.description && <p className="muted">{league.description}</p>}
        </div>
        {!isMember && user && (league.is_open || codeFromLink) && (
          <div className="inline-form">
            <button className="btn-primary" onClick={() => handleJoin()} disabled={busy}>
              {busy ? t("מצטרף...") : t("הצטרפות לליגה")}
            </button>
          </div>
        )}
        {!isMember && user && !league.is_open && !codeFromLink && (
          <p className="muted" style={{ fontSize: 14 }}>
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
                {standings.map((row, index) => {
                  const rank = index + 1;
                  const isMe = row.user.id === user?.id;
                  return (
                    <tr key={row.user.id} className={isMe ? "me-row" : undefined}>
                      <td>
                        <span className={`rank-badge${rank <= 3 ? ` rank-${rank}` : ""}`}>{rank}</span>
                      </td>
                      <td className="player-col">
                        <span className="player-cell">{row.user.name}</span>
                      </td>
                      <td>{row.played}</td>
                      <td>{row.wins}</td>
                      <td>{row.losses}</td>
                      <td>{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "matches" && (
          <>
            {isMember && (
              <div style={{ marginBottom: 20 }}>
                <button
                  type="button"
                  className="settings-row collapsible-toggle"
                  onClick={() => setShowMatches((v) => !v)}
                >
                  <h2>{t("המשחקים שלי")}</h2>
                  <span className="muted">{showMatches ? t("הסתר") : t("הצג")}</span>
                </button>

                {showMatches && (
                  <>
                    {matches.length === 0 && (
                      <EmptyState icon={<CalendarIcon aria-hidden="true" />}>
                        {t("עדיין אין משחקים.")}
                      </EmptyState>
                    )}
                    {groupMatchesByRound(matches).map(({ round, matches: roundMatches }) => (
                      <div key={round} style={{ marginTop: 16 }}>
                        <h3 className="week-label">
                          {round === "none"
                            ? t("משחקים נוספים")
                            : formatWeekLabel(league.schedule_started_at, round, t)}
                        </h3>
                        <ul className="match-list" style={{ marginTop: 8 }}>
                          {roundMatches.map((match) => (
                            <MatchRow
                              key={match.id}
                              match={match}
                              currentUserId={user.id}
                              onReport={handleReportScore}
                              onCancel={handleCancelMatch}
                              busy={busy}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            <div>
              <button
                type="button"
                className="settings-row collapsible-toggle"
                onClick={() => setShowAllMatches((v) => !v)}
              >
                <h2>{t("כל המשחקים בליגה")}</h2>
                <span className="muted">{showAllMatches ? t("הסתר") : t("הצג")}</span>
              </button>

              {showAllMatches && (
                <>
                  {allMatches.length === 0 && (
                    <EmptyState icon={<CalendarIcon aria-hidden="true" />}>
                      {t("עדיין אין משחקים בליגה.")}
                    </EmptyState>
                  )}
                  {groupMatchesByRound(allMatches).map(({ round, matches: roundMatches }) => (
                    <div key={round} style={{ marginTop: 16 }}>
                      <h3 className="week-label">
                        {round === "none"
                          ? t("משחקים נוספים")
                          : formatWeekLabel(league.schedule_started_at, round, t)}
                      </h3>
                      <ul className="match-list" style={{ marginTop: 8 }}>
                        {roundMatches.map((match) => {
                          const isCompleted = match.status === "completed";
                          const p1Won = isCompleted && match.player1_score > match.player2_score;
                          const p2Won = isCompleted && match.player2_score > match.player1_score;
                          return (
                            <li className="match-row" key={match.id}>
                              <div className="match-players">
                                {isCompleted ? (
                                  <span className={p1Won ? "match-winner-name" : "match-loser-name"}>
                                    {match.player1.name}
                                  </span>
                                ) : (
                                  <strong>{match.player1.name}</strong>
                                )}{" "}
                                <span className="vs-label">vs</span>{" "}
                                {isCompleted ? (
                                  <span className={p2Won ? "match-winner-name" : "match-loser-name"}>
                                    {match.player2.name}
                                  </span>
                                ) : (
                                  <strong>{match.player2.name}</strong>
                                )}
                              </div>
                              {!isCompleted ? (
                                <span className="pill-pending">{t("ממתין לתוצאה")}</span>
                              ) : (
                                <div>
                                  <div className="match-score">
                                    {match.player1_score} - {match.player2_score}
                                  </div>
                                  <div className="sets-breakdown">{formatSets(match.sets)}</div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
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
    </div>
  );
}


function MatchRow({ match, currentUserId, onReport, onCancel, busy }) {
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const { t } = useLanguage();
  const isPending = match.status === "pending";
  const iAmPlayer1 = match.player1.id === currentUserId;
  const opponent = iAmPlayer1 ? match.player2 : match.player1;
  const myScore = iAmPlayer1 ? match.player1_score : match.player2_score;
  const opponentScore = iAmPlayer1 ? match.player2_score : match.player1_score;
  const iWon = !isPending && myScore > opponentScore;
  const mySets = iAmPlayer1
    ? match.sets
    : match.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));

  function submit(sets) {
    onReport(match.id, sets);
    setReporting(false);
    setEditing(false);
  }

  return (
    <li className="match-row">
      <div className="match-players" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="vs-label">vs</span>
          <Link to={`/head-to-head/${opponent.id}`}>
            <strong>{opponent.name}</strong>
          </Link>
        </div>
        {!isPending && !editing && (
          <span style={{ color: iWon ? "var(--court)" : "var(--muted)", fontWeight: 700 }}>
            {iWon ? t("ניצחון") : t("הפסד")}
          </span>
        )}
      </div>
      {isPending ? (
        reporting ? (
          <SetScoreForm
            player1Name={match.player1.name}
            player2Name={match.player2.name}
            onSubmit={submit}
            onCancel={() => setReporting(false)}
            busy={busy}
          />
        ) : (
          <>
            <button
              type="button"
              className="btn-secondary"
              style={{ alignSelf: "flex-start" }}
              onClick={() => setReporting(true)}
            >
              {t("דווח תוצאה")}
            </button>
            <button
              type="button"
              className="link-btn"
              style={{ alignSelf: "flex-start", color: "var(--danger)" }}
              disabled={busy}
              onClick={() => onCancel(match.id)}
            >
              {t("ביטול אתגר")}
            </button>
          </>
        )
      ) : editing ? (
        <SetScoreForm
          player1Name={match.player1.name}
          player2Name={match.player2.name}
          initialSets={match.sets}
          onSubmit={submit}
          onCancel={() => setEditing(false)}
          busy={busy}
          submitLabel="עדכן תוצאה"
        />
      ) : (
        <>
          <div className="score-row">
            <span className={`status-dot ${iWon ? "dot-win" : "dot-loss"}`} />
            <div className="match-score">
              {myScore} - {opponentScore}
            </div>
          </div>
          <div className="sets-breakdown">{formatSets(mySets)}</div>
          <button
            type="button"
            className="link-btn"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setEditing(true)}
          >
            {t("ערוך תוצאה")}
          </button>
        </>
      )}
    </li>
  );
}
