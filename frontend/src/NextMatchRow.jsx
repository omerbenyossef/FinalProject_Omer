import { useState } from "react";
import { Link } from "react-router-dom";
import SetScoreForm from "./SetScoreForm.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { formatSets, formatDayMonth } from "./matchUtils.js";
import Avatar from "./Avatar.jsx";
import { ChevronIcon } from "./Icons.jsx";

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
  const myName = iAmPlayer1 ? match.player1.name : match.player2.name;
  const isCompleted = match.status === "completed";
  const myScore = iAmPlayer1 ? match.player1_score : match.player2_score;
  const opponentScore = iAmPlayer1 ? match.player2_score : match.player1_score;
  const iWon = isCompleted && myScore > opponentScore;
  const mySets = iAmPlayer1
    ? match.sets
    : match.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));

  if (isCompleted) {
    return (
      <li className="match-row match-row-completed">
        <div className="match-row-info">
          <div className="match-row-title">
            <strong className="name">{myName}</strong> <span className="vs-label">vs</span>{" "}
            <Link to={`/head-to-head/${opponent.id}`}>
              <strong className="name">{opponent.name}</strong>
            </Link>
          </div>
          {(leagueName || match.played_at) && (
            <Link to={`/leagues/${leagueId}`} className="match-row-subtitle">
              {[leagueName, match.played_at && formatDayMonth(new Date(match.played_at))]
                .filter(Boolean)
                .join(" · ")}
            </Link>
          )}
        </div>
        <Link to={`/head-to-head/${opponent.id}`} className="match-row-result">
          <div className={`sets-breakdown ${iWon ? "win" : "loss"}`}>{formatSets(mySets)}</div>
          <span className={`match-result-badge ${iWon ? "win" : "loss"}`}>{iWon ? "W" : "L"}</span>
          <ChevronIcon className="match-row-chevron" aria-hidden="true" />
        </Link>
      </li>
    );
  }

  return (
    <li className="match-row">
      <div className="match-players" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          {leagueName && (
            <Link to={`/leagues/${leagueId}`} className="sport-tag" style={{ marginBottom: 0 }}>
              {leagueName}
            </Link>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="vs-label">vs</span>
            <Link to={`/head-to-head/${opponent.id}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar name={opponent.name} size={22} />
              <strong>{opponent.name}</strong>
            </Link>
          </div>
        </div>
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
          {t("דווח תוצאה")}
        </button>
      )}
    </li>
  );
}
