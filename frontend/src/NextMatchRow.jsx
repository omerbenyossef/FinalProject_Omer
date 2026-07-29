import { useState } from "react";
import { Link } from "react-router-dom";
import SetScoreForm from "./SetScoreForm.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { formatSets } from "./matchUtils.js";

export default function NextMatchRow({
  match,
  currentUserId,
  onSubmit,
  busy,
  leagueName,
  leagueId,
}) {
  const [reporting, setReporting] = useState(false);
  const { t } = useLanguage();
  const iAmPlayer1 = match.player1.id === currentUserId;
  const opponent = iAmPlayer1 ? match.player2 : match.player1;
  const isCompleted = match.status === "completed";
  const myScore = iAmPlayer1 ? match.player1_score : match.player2_score;
  const opponentScore = iAmPlayer1 ? match.player2_score : match.player1_score;
  const iWon = isCompleted && myScore > opponentScore;
  const mySets = iAmPlayer1
    ? match.sets
    : match.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));

  return (
    <li className="match-row">
      <div className="match-players" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {leagueName && (
            <Link to={`/leagues/${leagueId}`} className="sport-tag" style={{ marginBottom: 0 }}>
              {leagueName}
            </Link>
          )}
          <span className="vs-label">vs</span>
          <Link to={`/head-to-head/${opponent.id}`}>
            <strong>{opponent.name}</strong>
          </Link>
        </div>
        {isCompleted && (
          <span style={{ color: iWon ? "var(--court)" : "var(--muted)", fontWeight: 700 }}>
            {iWon ? t("ניצחון") : t("הפסד")}
          </span>
        )}
      </div>

      {isCompleted ? (
        <>
          <div className="score-row">
            <span className={`status-dot ${iWon ? "dot-win" : "dot-loss"}`} />
            <div className="match-score">
              {myScore} - {opponentScore}
            </div>
          </div>
          <div className="sets-breakdown">{formatSets(mySets)}</div>
        </>
      ) : reporting ? (
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
          {t("דווח תוצאה")}
        </button>
      )}
    </li>
  );
}
