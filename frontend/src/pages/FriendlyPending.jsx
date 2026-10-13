import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChatIcon, ChevronIcon } from "../Icons.jsx";
import { durationLabel, formatDayMonth, weekdayFull } from "../matchUtils.js";

/* friendly-pending-185a — a friendly whose time one player has put down and
   the other hasn't answered yet.

   The screen it replaces broke the date across two lines and ran the status
   and the way out together on one ("waiting · cancel"), which made cancelling
   look like part of the status rather than a decision. This one says what is
   waiting on whom, when the match would be, and leaves the bottom of the
   screen to the two things there are to do about it. */

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function FriendlyPending({ detail, matchId, onChanged }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const name = detail.opponent.name;
  const start = detail.scheduled_at ? new Date(detail.scheduled_at) : null;
  // "asked_you" is the other player's time waiting on me; "sent" is mine
  // waiting on them.
  const mineToAnswer = detail.status === "asked_you";

  async function run(fn, after) {
    setBusy(true);
    setError("");
    try {
      await fn();
      after?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="fp">
      <div className="fp-head">
        <button type="button" className="fp-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="fp-head-label">{t("משחק ידידותי")}</span>
      </div>

      <div className="fp-top">
        <div className="fp-status">
          <span className="fp-status-dot" aria-hidden="true" />
          {mineToAnswer
            ? t("{name} מחכה לאישור שלך", { name })
            : t("ממתין לאישור של {name}", { name })}
        </div>
        <h1 className="fp-opp" dir="auto">
          {t("מול {name}", { name })}
        </h1>
      </div>

      {start && (
        <div className="fp-when">
          {/* Anton has no Hebrew glyphs, so it is kept to the clock. */}
          <span className="fp-when-time" dir="ltr">
            {hhmm(start)}
          </span>
          <span className="fp-when-date">
            {weekdayFull(start, t)},{" "}
            <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
              {formatDayMonth(start)}
            </span>
          </span>
        </div>
      )}

      <div className="fp-rows">
        <div className="fp-row">
          <span className="fp-row-label">{t("מקום")}</span>
          <span
            className={`fp-row-value${detail.venue || detail.court ? "" : " is-empty"}`}
            dir="auto"
          >
            {detail.venue?.name || detail.court || t("לא נקבע")}
          </span>
        </div>
        <div className="fp-row is-last">
          <span className="fp-row-label">{t("משך")}</span>
          <span className="fp-row-value">{durationLabel(detail.duration_minutes || 60, t)}</span>
        </div>
      </div>

      {error && <p className="fp-error error">{t(error)}</p>}

      <div className="fp-spacer" />

      <div className="fp-actions">
        {mineToAnswer && (
          <button
            type="button"
            className="fp-confirm"
            disabled={busy}
            onClick={() => run(() => api.confirmMatchSchedule(matchId), onChanged)}
          >
            {t("אשר משחק")}
          </button>
        )}
        <button
          type="button"
          className="fp-chat"
          onClick={() => navigate(`/matches/${matchId}/chat`)}
        >
          <ChatIcon width={17} height={17} aria-hidden="true" />
          {t("צ'אט עם {name}", { name })}
        </button>
        <button
          type="button"
          className="fp-drop"
          disabled={busy}
          onClick={() =>
            mineToAnswer
              ? // Turning a time down is an answer, not a withdrawal: it drops
                // the time and puts them back where it was agreed.
                run(() => api.declineMatchSchedule(matchId), () =>
                  navigate(`/matches/${matchId}/chat`, { replace: true })
                )
              : setConfirming(true)
          }
        >
          {mineToAnswer ? t("דחה") : t("בטל את ההצעה")}
        </button>
      </div>

      {confirming && (
        <div className="ms-sheet-overlay" onClick={() => !busy && setConfirming(false)}>
          <div className="ms-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="ms-sheet-grip" aria-hidden="true" />
            <h2 className="ms-sheet-title">{t("לבטל את ההצעה?")}</h2>
            <p className="ms-sheet-body">
              {t("{name} לא יקבל/תקבל את הזמן הזה, ותוכלו לסכם זמן אחר בצ'אט.", { name })}
            </p>
            <button
              type="button"
              className="ms-sheet-go"
              disabled={busy}
              onClick={() => run(() => api.declineMatchSchedule(matchId), onChanged)}
            >
              {busy ? t("מבטל...") : t("כן, בטל את ההצעה")}
            </button>
            <button
              type="button"
              className="ms-sheet-keep"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              {t("השאר אותה")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
