import { useState } from "react";
import { Link } from "react-router-dom";
import SetScoreForm from "./SetScoreForm.jsx";

export default function NextMatchRow({ match, currentUserId, onSubmit, busy, leagueName, leagueId }) {
  const [reporting, setReporting] = useState(false);
  const opponent = match.player1.id === currentUserId ? match.player2 : match.player1;

  return (
    <li className="match-row">
      <div className="match-players">
        {leagueName && (
          <Link to={`/leagues/${leagueId}`} className="sport-tag" style={{ marginBottom: 0 }}>
            {leagueName}
          </Link>
        )}
        <span>נגד</span>
        <Link to={`/head-to-head/${opponent.id}`}>
          <strong>{opponent.name}</strong>
        </Link>
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
