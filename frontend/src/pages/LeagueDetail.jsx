import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";

export default function LeagueDetail() {
  const { leagueId } = useParams();
  const { user } = useAuth();

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [error, setError] = useState("");
  const [opponentId, setOpponentId] = useState("");
  const [busy, setBusy] = useState(false);

  const isMember = members.some((m) => m.id === user?.id);

  async function loadAll() {
    try {
      const [leagueData, membersData, standingsData] = await Promise.all([
        api.getLeague(leagueId),
        api.listMembers(leagueId),
        api.getStandings(leagueId),
      ]);
      setLeague(leagueData);
      setMembers(membersData);
      setStandings(standingsData);

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
          <ul className="plain-list">
            {members.map((m) => (
              <li key={m.id}>
                {m.name}
                {m.id === user?.id && <span className="muted"> (את/ה)</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>טבלת דירוג</h2>
          <table className="standings-table">
            <thead>
              <tr>
                <th>שחקן</th>
                <th>משחקים</th>
                <th>נצחונות</th>
                <th>הפסדים</th>
                <th>נקודות</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.user.id}>
                  <td>{row.user.name}</td>
                  <td>{row.played}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                busy={busy}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MatchRow({ match, onReport, busy }) {
  const [p1Score, setP1Score] = useState("");
  const [p2Score, setP2Score] = useState("");
  const isPending = match.status === "pending";

  return (
    <li className="match-row">
      <div className="match-players">
        <strong>{match.player1.name}</strong> נגד <strong>{match.player2.name}</strong>
      </div>
      {isPending ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            onReport(match.id, p1Score, p2Score);
          }}
        >
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
            דווח תוצאה
          </button>
        </form>
      ) : (
        <div className="match-score">
          {match.player1_score} - {match.player2_score}
        </div>
      )}
    </li>
  );
}
