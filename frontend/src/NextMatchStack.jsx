import { useRef, useState } from "react";
import MatchCard from "./MatchCard.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { formatWeekShort } from "./matchUtils.js";

const MAX_VISIBLE = 3;
const SWIPE_THRESHOLD = 40;

export default function NextMatchStack({ matches, currentUserId, busy, onSubmit }) {
  const { t } = useLanguage();
  const [active, setActive] = useState(0);
  const touchStartX = useRef(null);

  const n = matches.length;
  if (n === 0) return null;
  const safeActive = active % n;

  function advance() {
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

          return (
            <div key={entry.match.id} className="next-match-stack-card" data-offset={o}>
              {isFront && (
                <MatchCard
                  className="match-card-stack-front"
                  match={entry.match}
                  currentUserId={currentUserId}
                  meta={[entry.league_name, formatWeekShort(entry.match.round_number, t)]
                    .filter(Boolean)
                    .join(" · ")}
                  busy={busy}
                  maxSets={entry.best_of}
                  onSubmit={(sets) => onSubmit(entry.league_id, entry.match.id, sets)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
