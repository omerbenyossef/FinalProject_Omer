import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon, CloseIcon } from "../Icons.jsx";
import { weekdayFull } from "../matchUtils.js";
import { downloadCalendarFile, matchCalendarFile } from "../calendar.js";
import { openBooking } from "../booking.js";

/* match-set-180a — the screen for a match whose time both players have agreed
   to. One column, in the order the questions actually get asked: when, against
   whom, the details, then what can be done about it. 180d adds calling the
   match off, which had no way in at all before. */

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dayMonth(date) {
  return `${date.getDate()}.${date.getMonth() + 1}`;
}

// Whole days between today and the match, so "tomorrow" doesn't depend on
// whether the match is at 09:00 or 23:00.
function dayDelta(date) {
  const a = new Date(date);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
}

function whenLabel(date, t) {
  const days = dayDelta(date);
  if (days === 0) return t("היום");
  if (days === 1) return t("מחר");
  if (days > 1) return t("בעוד {n} ימים", { n: days });
  if (days === -1) return t("היה אתמול");
  return t("לפני {n} ימים", { n: Math.abs(days) });
}

function durationLabel(minutes, t) {
  if (minutes === 60) return t("שעה");
  if (minutes === 90) return t("שעה וחצי");
  if (minutes === 120) return t("שעתיים");
  return t("{n} דקות", { n: minutes });
}

function formatLabel(detail, t) {
  if (detail.kind === "friendly") return t("נקבע בדיווח התוצאה");
  return detail.max_sets === 5 ? t("חמש סטים") : t("שלוש סטים");
}

export default function MatchSet({ detail, matchId, onChanged }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = new Date(detail.scheduled_at);
  // The server may carry no duration for an older match. 90 minutes is the
  // answer to "how long do I block the calendar for" — shown, never saved.
  const minutes = detail.duration_minutes || 90;
  const end = new Date(start.getTime() + minutes * 60000);
  const opponentName = detail.opponent.name;

  function handleCalendar() {
    const title =
      detail.kind === "friendly"
        ? t("משחק מול {name}", { name: opponentName })
        : t("{league} · מול {name}", { league: detail.league_name, name: opponentName });
    downloadCalendarFile(
      matchCalendarFile({
        title,
        start,
        durationMinutes: minutes,
        location: detail.court,
        uid: `rally-match-${matchId}@rally`,
      }),
      `rally-match-${matchId}.ics`
    );
  }

  async function handleCancel() {
    setBusy(true);
    setError("");
    try {
      await api.cancelMatch(matchId);
      setConfirming(false);
      // A league match still exists and still needs a time, so its own screen
      // is where to land. A friendly is over — there is nothing to come back to.
      if (detail.kind === "friendly") {
        navigate("/leagues", { replace: true });
      } else {
        await onChanged?.();
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const cancelBody =
    detail.kind === "friendly"
      ? t("{name} יקבל הודעה שהמשחק ב{date} בוטל. אפשר לקבוע משחק חדש בכל רגע.", {
          name: opponentName,
          date: `${weekdayFull(start, t)}, ${dayMonth(start)}`,
        })
      : t("{name} יקבל הודעה שהמשחק בוטל. המשחק יחזור לרשימת המשחקים שצריך לקבוע להם זמן.", {
          name: opponentName,
        });

  return (
    <div className="ms">
      <div className="ms-head">
        <button type="button" className="ms-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="ms-head-label" dir="auto" style={{ unicodeBidi: "isolate" }}>
          {detail.kind === "friendly" ? t("משחק ידידותי") : detail.league_name}
        </span>
      </div>

      <div className="ms-when">
        <div className="ms-when-tag" dir="ltr">
          <span className="ms-when-dot" aria-hidden="true" />
          MATCH IS SET
        </div>
        <div className="ms-when-row">
          {/* Anton has no Hebrew glyphs, so it is kept to the clock. */}
          <span className="ms-when-time" dir="ltr">
            {hhmm(start)}
          </span>
          <span className="ms-when-date">
            {weekdayFull(start, t)},{" "}
            <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
              {dayMonth(start)}
            </span>
          </span>
        </div>
        <div className="ms-when-rel">{whenLabel(start, t)}</div>
      </div>

      <button type="button" className="ms-opp" onClick={() => navigate(`/players/${detail.opponent.id}`)}>
        <Avatar name={opponentName} photoUrl={detail.opponent.photo_url} size={46} />
        <span className="ms-opp-body">
          <span className="ms-opp-name" dir="auto" style={{ unicodeBidi: "isolate" }}>
            {opponentName}
          </span>
          <span className="ms-opp-meta" dir="ltr">
            {detail.opponent_ntrp != null ? `NTRP ${detail.opponent_ntrp.toFixed(1)}` : "NTRP —"}
            {detail.my_ntrp != null ? ` · RATING ${detail.my_ntrp.toFixed(1)}` : ""}
          </span>
        </span>
        <ChevronIcon className="ms-opp-chev chevron-icon" aria-hidden="true" />
      </button>

      <div className="ms-rows">
        <div className="ms-row">
          <span className="ms-row-label">{t("משך")}</span>
          <span className="ms-row-value">
            {durationLabel(minutes, t)}{" "}
            <span className="ms-row-range" dir="ltr">
              {hhmm(start)}–{hhmm(end)}
            </span>
          </span>
        </div>
        <div className="ms-row">
          <span className="ms-row-label">{t("ביניכם")}</span>
          <span className="ms-row-value ms-row-mono" dir="ltr">
            {detail.h2h_wins}-{detail.h2h_losses}
          </span>
        </div>
        <div className="ms-row">
          <span className="ms-row-label">{t("פורמט")}</span>
          <span className="ms-row-value">{formatLabel(detail, t)}</span>
        </div>
        <div className="ms-row is-last">
          <span className="ms-row-label">{t("מקום")}</span>
          <span className={`ms-row-value${detail.court ? "" : " is-empty"}`} dir="auto">
            {detail.court || t("לא נקבע")}
          </span>
        </div>
      </div>

      {error && <p className="ms-error error">{t(error)}</p>}

      <div className="ms-spacer" />

      <div className="ms-actions">
        <button type="button" className="ms-primary" onClick={handleCalendar}>
          {t("הוסף ליומן")}
        </button>
        {/* A link out, not a booking flow: Lazuz has no public API, so this
            hands them over rather than pretending to book on their behalf. */}
        <button type="button" className="ms-secondary" onClick={openBooking}>
          {t("הזמן מגרש")}
        </button>
        <button
          type="button"
          className="ms-secondary"
          onClick={() => navigate(`/matches/${matchId}/chat`)}
        >
          {t("צ'אט")}
          {detail.unread_messages > 0 && (
            <span className="ms-unread" dir="ltr">
              {detail.unread_messages}
            </span>
          )}
        </button>
        <button
          type="button"
          className="ms-secondary"
          onClick={() => navigate(`/matches/${matchId}/schedule`)}
        >
          {t("הצע זמן אחר")}
        </button>
        <button type="button" className="ms-cancel" onClick={() => setConfirming(true)}>
          <CloseIcon width={17} height={17} aria-hidden="true" />
          {t("בטל את המשחק")}
        </button>
      </div>

      {confirming && (
        <div className="ms-sheet-overlay" onClick={() => !busy && setConfirming(false)}>
          <div className="ms-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="ms-sheet-grip" aria-hidden="true" />
            <h2 className="ms-sheet-title">{t("לבטל את המשחק?")}</h2>
            <p className="ms-sheet-body">{cancelBody}</p>
            <button type="button" className="ms-sheet-go" disabled={busy} onClick={handleCancel}>
              {busy ? t("מבטל...") : t("כן, בטל את המשחק")}
            </button>
            <button
              type="button"
              className="ms-sheet-keep"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              {t("השאר אותו")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
