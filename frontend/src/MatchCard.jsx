import { useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "./Avatar.jsx";
import SetScoreForm from "./SetScoreForm.jsx";
import { useLanguage } from "./LanguageContext.jsx";

export default function MatchCard({ match, currentUserId, meta, busy, onSubmit, maxSets, className }) {
  const { t } = useLanguage();
  const [reporting, setReporting] = useState(false);
  const opponent = match.player1.id === currentUserId ? match.player2 : match.player1;

  return (
    <div className={`match-card${className ? ` ${className}` : ""}`}>
      <div className="match-card-top">
        <div className="match-card-info">
          <Avatar name={opponent.name} size={36} />
          <div className="match-card-text">
            <Link
              to={`/head-to-head/${opponent.id}`}
              className="match-card-name"
              onClick={(e) => e.stopPropagation()}
            >
              {t("מול {name}", { name: opponent.name })}
            </Link>
            <div className="match-card-meta">{meta}</div>
          </div>
        </div>
        {!reporting && (
          <button
            type="button"
            className="btn-gold-pill"
            onClick={(e) => {
              e.stopPropagation();
              setReporting(true);
            }}
          >
            {t("דווח")}
          </button>
        )}
      </div>

      {reporting && (
        <div onClick={(e) => e.stopPropagation()}>
          <SetScoreForm
            player1Name={match.player1.name}
            player2Name={match.player2.name}
            busy={busy}
            onSubmit={(sets) => {
              onSubmit(sets);
              setReporting(false);
            }}
            onCancel={() => setReporting(false)}
            maxSets={maxSets}
          />
        </div>
      )}
    </div>
  );
}
