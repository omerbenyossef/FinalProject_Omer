import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "./Avatar.jsx";
import SetScoreForm from "./SetScoreForm.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { formatWeekShort } from "./matchUtils.js";

const MAX_VISIBLE = 3;
const SWIPE_THRESHOLD = 40;

export default function NextMatchStack({ matches, currentUserId, busy, onSubmit }) {
  const { t } = useLanguage();
  const [active, setActive] = useState(0);
  const [reporting, setReporting] = useState(false);
  const touchStartX = useRef(null);

  const n = matches.length;
  if (n === 0) return null;
  const safeActive = active % n;
  const frontEntry = matches[safeActive];
  const frontMatch = frontEntry.match;

  function advance() {
    if (reporting) return;
    setActive((a) => (a + 1) % n);
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD) advance();
  }

  return (
    <div className="next-match-section">
      <div className="next-match-stack-header">
        <span>{t("המשחקים הבאים")}</span>
        {n > 1 && <span className="count">{t("{n} משחקים", { n })}</span>}
      </div>
      <div
        className="next-match-stack"
        onClick={advance}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {matches.map((entry, idx) => {
          const o = (idx - safeActive + n) % n;
          if (o >= MAX_VISIBLE) return null;
          const isFront = o === 0;
          const entryOpponent =
            entry.match.player1.id === currentUserId ? entry.match.player2 : entry.match.player1;

          return (
            <div key={entry.match.id} className="next-match-stack-card" data-offset={o}>
              {isFront && (
                <div className="next-match-stack-front">
                  <div className="next-match-stack-info">
                    <Avatar name={entryOpponent.name} size={36} />
                    <div className="next-match-stack-text">
                      <Link
                        to={`/head-to-head/${entryOpponent.id}`}
                        className="next-match-stack-name"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t("מול {name}", { name: entryOpponent.name })}
                      </Link>
                      <div className="next-match-stack-meta">
                        {[entry.league_name, formatWeekShort(entry.match.round_number, t)]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
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
              )}
            </div>
          );
        })}
      </div>

      {reporting && (
        <SetScoreForm
          player1Name={frontMatch.player1.name}
          player2Name={frontMatch.player2.name}
          busy={busy}
          onSubmit={(sets) => {
            onSubmit(frontEntry.league_id, frontMatch.id, sets);
            setReporting(false);
          }}
          onCancel={() => setReporting(false)}
        />
      )}
    </div>
  );
}
