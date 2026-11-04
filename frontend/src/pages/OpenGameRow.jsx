import { useLanguage } from "../LanguageContext.jsx";
import { weekdayShort } from "../matchUtils.js";

/* 189b — one open game, as a row.
   The spec specifies this row for the hub's preview and says to use the same
   shape for the full list until that screen is designed, so it lives in its
   own file and both screens render it. */

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function OpenGameRow({ game, onJoin, busy }) {
  const { t } = useLanguage();
  const start = new Date(game.starts_at);
  const needed = game.seats_left;
  const meta = [
    game.is_doubles ? t("זוגות") : t("יחידים"),
    `NTRP ${game.level_min.toFixed(1)}–${game.level_max.toFixed(1)}`,
    needed === 1 ? t("חסר 1") : needed > 1 ? t("חסרים {n}", { n: needed }) : t("מלא"),
  ];

  return (
    <div className="ogrow">
      <span className="ogrow-when">
        {/* Anton carries digits but no Hebrew glyphs, so it is kept to the
            clock and the weekday is set in Plex beneath it. */}
        <span className="ogrow-time" dir="ltr">
          {hhmm(start)}
        </span>
        <span className="ogrow-day">{weekdayShort(start, t)}</span>
      </span>

      <span className="ogrow-body">
        <span className="ogrow-where" dir="auto" style={{ unicodeBidi: "isolate" }}>
          {game.where || t("מקום ייקבע")}
        </span>
        <span className="ogrow-meta">
          {meta.map((part, i) => (
            <span key={i} style={{ display: "contents" }}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                {part}
              </span>
            </span>
          ))}
        </span>
      </span>

      {game.joined ? (
        <span className="ogrow-in">{t("בפנים")}</span>
      ) : game.blocked_reason ? (
        /* The game stays on screen with the reason on it rather than being
           filtered away — the same rule the out-of-range leagues follow. */
        <span className="ogrow-blocked">{t(game.blocked_reason)}</span>
      ) : (
        <button type="button" className="ogrow-join" onClick={() => onJoin?.(game)} disabled={busy}>
          {t("הצטרף")}
        </button>
      )}
    </div>
  );
}
