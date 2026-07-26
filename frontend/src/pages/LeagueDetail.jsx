import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import Avatar from "../Avatar.jsx";

export default function LeagueDetail() {
  const { leagueId } = useParams();
  const { user } = useAuth();

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [error, setError] = useState("");
  const [opponentId, setOpponentId] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function handleChallenge(e) {
    e.preventDefault();
    if (!opponentId) return;
    setBusy(true);
    setError("");
    try {
      await api.createMatch(leagueId, Number(opponentId));
      setOpponentId("");
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReportScore(matchId, p1Score, p2Score) {
    setBusy(true);
    setError("");
    try {
      await api.reportScore(leagueId, matchId, {
        player1_score: Number(p1Score),
        player2_score: Number(p2Score),
      });
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

  const opponents = members.filter((m) => m.id !== user?.id);

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

      <div className="two-col">
        <section className="card">
          <h2>שחקנים בליגה ({members.length})</h2>
          <div className="member-chips">
            {members.map((m) => (
              <div className="member-chip" key={m.id}>
                <Avatar name={m.name} id={m.id} size={24} />
                <span>
                  {m.name}
                  {m.id === user?.id && <span className="muted"> (את/ה)</span>}
                </span>
              </div>
            ))}
          </div>
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
                        <span className="player-cell">
                          <Avatar name={row.user.name} id={row.user.id} size={22} />
                          {row.user.name}
                        </span>
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

      {isMember && (
        <section className="card">
          <h2>מצא יריב</h2>
          {opponents.length === 0 ? (
            <p className="muted">אין עדיין שחקנים נוספים בליגה. שתפו חברים כדי שיצטרפו!</p>
          ) : (
            <form className="inline-form" onSubmit={handleChallenge}>
              <select value={opponentId} onChange={(e) => setOpponentId(e.target.value)} required>
                <option value="">בחר יריב...</option>
                {opponents.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary" disabled={busy}>
                אתגר משחק
              </button>
            </form>
          )}
        </section>
      )}

      {isMember && (
        <section className="card">
          <h2>המשחקים שלי</h2>
          {matches.length === 0 && <p className="muted">עדיין אין משחקים.</p>}
          <ul className="match-list">
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
        </section>
      )}

      <section className="card">
        <h2>כל המשחקים בליגה</h2>
        {allMatches.length === 0 && <p className="muted">עדיין אין משחקים בליגה.</p>}
        <ul className="match-list">
          {allMatches.map((match) => (
            <li className="match-row" key={match.id}>
              <div className="match-players">
                <Avatar name={match.player1.name} id={match.player1.id} size={20} />
                <strong>{match.player1.name}</strong> נגד{" "}
                <Avatar name={match.player2.name} id={match.player2.id} size={20} />
                <strong>{match.player2.name}</strong>
              </div>
              {match.status === "pending" ? (
                <span className="pill-pending">ממתין לתוצאה</span>
              ) : (
                <div className="match-score">
                  {match.player1_score} - {match.player2_score}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MatchRow({ match, onReport, onCancel, busy }) {
  const [p1Score, setP1Score] = useState(match.player1_score ?? "");
  const [p2Score, setP2Score] = useState(match.player2_score ?? "");
  const [editing, setEditing] = useState(false);
  const isPending = match.status === "pending";

  function submit(e) {
    e.preventDefault();
    onReport(match.id, p1Score, p2Score);
    setEditing(false);
  }

  return (
    <li className="match-row">
      <div className="match-players">
        <strong>{match.player1.name}</strong> נגד <strong>{match.player2.name}</strong>
      </div>
      {isPending || editing ? (
        <>
          <form className="inline-form" onSubmit={submit}>
            <input
              type="number"
              min="0"
              placeholder={`תוצאת ${match.player1.name}`}
              value={p1Score}
              onChange={(e) => setP1Score(e.target.value)}
              required
            />
            <span>-</span>
            <input
              type="number"
              min="0"
              placeholder={`תוצאת ${match.player2.name}`}
              value={p2Score}
              onChange={(e) => setP2Score(e.target.value)}
              required
            />
            <button type="submit" className="btn-secondary" disabled={busy}>
              {editing ? "עדכן תוצאה" : "דווח תוצאה"}
            </button>
            {editing && (
              <button type="button" className="link-btn" onClick={() => setEditing(false)}>
                ביטול
              </button>
            )}
          </form>
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
