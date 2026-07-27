import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import NextMatchRow from "../NextMatchRow.jsx";
import CircularGauge from "../CircularGauge.jsx";
import { UserPlusIcon } from "../Icons.jsx";
import { formatSets, formatWeekLabel } from "../matchUtils.js";

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
  const autoJoinAttempted = useRef(false);

  const isMember = members.some((m) => m.id === user?.id);

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
      const message = `בוא/י תצטרף/י לליגה "${league.name}" ב-Rally!\n${url}`;
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

  if (!league) return <p className="muted">טוען...</p>;

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
          <span className="sport-tag">{league.sport.name}</span>
          <h1>{league.name}</h1>
          {league.description && <p className="muted">{league.description}</p>}
        </div>
        {!isMember && user && (league.is_open || codeFromLink) && (
          <div className="inline-form">
            <button className="btn-primary" onClick={() => handleJoin()} disabled={busy}>
              {busy ? "מצטרף..." : "הצטרפות לליגה"}
            </button>
          </div>
        )}
        {!isMember && user && !league.is_open && !codeFromLink && (
          <p className="muted" style={{ fontSize: 14 }}>
            הליגה סגורה. כדי להצטרף צריך קישור הזמנה מאחד מחברי הליגה.
          </p>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {isMember && myNextMatch && (
        <section className="card">
          <h2>המשחק הבא שלך</h2>
          <ul className="match-list">
            <NextMatchRow
              match={myNextMatch}
              currentUserId={user.id}
              onSubmit={(sets) => handleReportScore(myNextMatch.id, sets)}
              busy={busy}
            />
          </ul>
        </section>
      )}

      {isMember && myStanding && (
        <section className="card">
          <div className="hero-stat">
            <CircularGauge
              value={myStanding.wins}
              max={Math.max(myStanding.played, 1)}
              size={92}
              strokeWidth={9}
            >
              <div className="gauge-value">{myStanding.wins}</div>
              <div className="gauge-caption">/ {myStanding.played} משחקים</div>
            </CircularGauge>
            <div className="hero-copy">
              <span className="eyebrow">הסטטיסטיקה שלי בליגה</span>
              <div className="chip-row">
                <span className="chip">{myStanding.points} נקודות</span>
                <span className="chip">{myStanding.losses} הפסדים</span>
                {myWinRate !== null && <span className="chip">{myWinRate}% ניצחונות</span>}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <h2>טבלת דירוג</h2>
        <div className="table-wrap">
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="player-col">שחקן</th>
                <th>משחקים</th>
                <th>נצחונות</th>
                <th>הפסדים</th>
                <th>נקודות</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, index) => {
                const rank = index + 1;
                const isMe = row.user.id === user?.id;
                return (
                  <tr key={row.user.id} className={isMe ? "me-row" : undefined}>
                    <td>
                      <span className={`rank-badge${rank === 1 ? " rank-1" : ""}`}>{rank}</span>
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
      </section>

      {inviteError && <p className="error">{inviteError}</p>}

      {isMember && (
        <button
          type="button"
          className="invite-fab"
          onClick={handleShareWhatsApp}
          disabled={inviteLoading}
        >
          <UserPlusIcon aria-hidden="true" />
          {inviteLoading ? "טוען..." : "הזמן חבר לליגה"}
        </button>
      )}

      {isCreator && (
        <section className="card">
          <h2>לוח משחקים</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            יצירת לוח משחקים מסדרת אוטומטית משחק בין כל זוג שחקנים בליגה שעדיין לא שיחקו ביניהם
            (בסדר אקראי). אפשר להריץ שוב כל פעם שמצטרפים שחקנים חדשים.
          </p>
          <button className="btn-primary" onClick={handleGenerateSchedule} disabled={busy}>
            {busy ? "יוצר..." : "צור לוח משחקים"}
          </button>
        </section>
      )}

      {isMember && (
        <section className="card">
          <button
            type="button"
            className="settings-row collapsible-toggle"
            onClick={() => setShowMatches((v) => !v)}
          >
            <h2>המשחקים שלי</h2>
            <span className="muted">{showMatches ? "הסתר" : "הצג"}</span>
          </button>

          {showMatches && (
            <>
              {matches.length === 0 && <p className="muted">עדיין אין משחקים.</p>}
              {groupMatchesByRound(matches).map(({ round, matches: roundMatches }) => (
                <div key={round} style={{ marginTop: 16 }}>
                  <h3 className="week-label">
                    {round === "none"
                      ? "משחקים נוספים"
                      : formatWeekLabel(league.schedule_started_at, round)}
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
        </section>
      )}

      <section className="card">
        <button
          type="button"
          className="settings-row collapsible-toggle"
          onClick={() => setShowAllMatches((v) => !v)}
        >
          <h2>כל המשחקים בליגה</h2>
          <span className="muted">{showAllMatches ? "הסתר" : "הצג"}</span>
        </button>

        {showAllMatches && (
          <>
            {allMatches.length === 0 && <p className="muted">עדיין אין משחקים בליגה.</p>}
            {groupMatchesByRound(allMatches).map(({ round, matches: roundMatches }) => (
              <div key={round} style={{ marginTop: 16 }}>
                <h3 className="week-label">
                  {round === "none"
                    ? "משחקים נוספים"
                    : formatWeekLabel(league.schedule_started_at, round)}
                </h3>
                <ul className="match-list" style={{ marginTop: 8 }}>
                  {roundMatches.map((match) => (
                    <li className="match-row" key={match.id}>
                      <div className="match-players">
                        <strong>{match.player1.name}</strong> נגד{" "}
                        <strong>{match.player2.name}</strong>
                      </div>
                      {match.status === "pending" ? (
                        <span className="pill-pending">ממתין לתוצאה</span>
                      ) : (
                        <div>
                          <div className="match-score">
                            {match.player1_score} - {match.player2_score}
                          </div>
                          <div className="sets-breakdown">{formatSets(match.sets)}</div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}


function MatchRow({ match, currentUserId, onReport, onCancel, busy }) {
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
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
          <span>נגד</span>
          <Link to={`/head-to-head/${opponent.id}`}>
            <strong>{opponent.name}</strong>
          </Link>
        </div>
        {!isPending && !editing && (
          <span style={{ color: iWon ? "var(--court)" : "var(--muted)", fontWeight: 700 }}>
            {iWon ? "ניצחון" : "הפסד"}
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
              דווח תוצאה
            </button>
            <button
              type="button"
              className="link-btn"
              style={{ alignSelf: "flex-start", color: "var(--danger)" }}
              disabled={busy}
              onClick={() => onCancel(match.id)}
            >
              ביטול אתגר
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
            ערוך תוצאה
          </button>
        </>
      )}
    </li>
  );
}
