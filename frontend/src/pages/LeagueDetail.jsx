import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import { formatSets } from "../matchUtils.js";

export default function LeagueDetail() {
  const { leagueId } = useParams();
  const { user } = useAuth();

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

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

  async function handleJoin() {
    setBusy(true);
    setError("");
    try {
      await api.joinLeague(leagueId);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="sport-tag">{league.sport.name}</span>
          <h1>{league.name}</h1>
          {league.description && <p className="muted">{league.description}</p>}
        </div>
        {!isMember && (
          <button className="btn-primary" onClick={handleJoin} disabled={busy}>
            הצטרפות לליגה
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {isMember && myNextMatch && (
        <section className="card">
          <h2>המשחק הבא שלך</h2>
          <ul className="match-list">
            <MyNextMatchRow
              match={myNextMatch}
              currentUserId={user.id}
              onSubmit={(sets) => handleReportScore(myNextMatch.id, sets)}
              busy={busy}
            />
          </ul>
        </section>
      )}

      <div className="two-col">
        <section className="card">
          <button
            type="button"
            className="settings-row collapsible-toggle"
            onClick={() => setShowMembers((v) => !v)}
          >
            <h2>שחקנים בליגה ({members.length})</h2>
            <span className="muted">{showMembers ? "הסתר" : "הצג"}</span>
          </button>

          {showMembers && (
            <div className="member-chips" style={{ marginTop: 14 }}>
              {members.map((m) => (
                <div className="member-chip" key={m.id}>
                  <span>
                    {m.name}
                    {m.id === user?.id && <span className="muted"> (את/ה)</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

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
      </div>

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
              <ul className="match-list" style={{ marginTop: 14 }}>
                {matches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    onReport={handleReportScore}
                    onCancel={handleCancelMatch}
                    busy={busy}
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2>כל המשחקים בליגה</h2>
        {allMatches.length === 0 && <p className="muted">עדיין אין משחקים בליגה.</p>}
        <ul className="match-list">
          {allMatches.map((match) => (
            <li className="match-row" key={match.id}>
              <div className="match-players">
                <strong>{match.player1.name}</strong> נגד <strong>{match.player2.name}</strong>
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
      </section>
    </div>
  );
}

function MyNextMatchRow({ match, currentUserId, onSubmit, busy }) {
  const [reporting, setReporting] = useState(false);
  const opponent = match.player1.id === currentUserId ? match.player2 : match.player1;

  return (
    <li className="match-row">
      <div className="match-players">
        <span>נגד</span>
        <strong>{opponent.name}</strong>
      </div>
      {reporting ? (
        <SetScoreForm
          player1Name={match.player1.name}
          player2Name={match.player2.name}
          onSubmit={(sets) => {
            onSubmit(sets);
            setReporting(false);
          }}
          onCancel={() => setReporting(false)}
          busy={busy}
        />
      ) : (
        <button
          type="button"
          className="btn-secondary"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setReporting(true)}
        >
          דווח תוצאה
        </button>
      )}
    </li>
  );
}

function MatchRow({ match, onReport, onCancel, busy }) {
  const [editing, setEditing] = useState(false);
  const isPending = match.status === "pending";

  function submit(sets) {
    onReport(match.id, sets);
    setEditing(false);
  }

  return (
    <li className="match-row">
      <div className="match-players">
        <strong>{match.player1.name}</strong> נגד <strong>{match.player2.name}</strong>
      </div>
      {isPending || editing ? (
        <>
          <SetScoreForm
            player1Name={match.player1.name}
            player2Name={match.player2.name}
            initialSets={match.sets}
            onSubmit={submit}
            onCancel={editing ? () => setEditing(false) : undefined}
            busy={busy}
            submitLabel={editing ? "עדכן תוצאה" : "דווח תוצאה"}
          />
          {isPending && (
            <button
              type="button"
              className="link-btn"
              style={{ alignSelf: "flex-start", color: "var(--danger)" }}
              disabled={busy}
              onClick={() => onCancel(match.id)}
            >
              ביטול אתגר
            </button>
          )}
        </>
      ) : (
        <>
          <div className="match-score">
            {match.player1_score} - {match.player2_score}
          </div>
          <div className="sets-breakdown">{formatSets(match.sets)}</div>
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
