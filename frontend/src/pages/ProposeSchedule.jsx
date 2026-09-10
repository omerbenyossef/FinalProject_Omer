import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon, CheckIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { roundDueDateObj, hasHebrewChars, daysWord } from "../matchUtils.js";

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function buildDayOptions(roundEndDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 5;
  if (roundEndDate) {
    const end = new Date(roundEndDate);
    end.setHours(0, 0, 0, 0);
    const daysLeft = Math.floor((end - today) / 86400000) + 1;
    count = Math.max(1, Math.min(5, daysLeft));
  }
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function buildTimeSlots() {
  const slots = [];
  for (let h = 7; h <= 22; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 22) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

const TIME_SLOTS = buildTimeSlots();

// A slot is impossible if it overlaps a match either player already has
// confirmed — the server rejects those anyway (_enforce_schedule_conflicts),
// so the grid may as well say so before the tap. "tight" is the same engine's
// soft warning: legal, but back-to-back with another match.
function slotState(day, time, minutes, busyWindows, gapMs) {
  const [h, m] = time.split(":").map(Number);
  const start = new Date(day);
  start.setHours(h, m, 0, 0);
  const startMs = start.getTime();
  if (startMs <= Date.now()) return { kind: "past" };
  const endMs = startMs + minutes * 60000;

  for (const w of busyWindows) {
    if (startMs < w.end && w.start < endMs) return { kind: "busy", whose: w.whose };
  }
  for (const w of busyWindows) {
    const gap = w.end <= startMs ? startMs - w.end : w.start - endMs;
    if (gap >= 0 && gap < gapMs) return { kind: "tight", whose: w.whose };
  }
  return { kind: "free" };
}

const MAX_PICKS = 5;

const DURATION_OPTIONS = [60, 90, 120];
function durationLabel(minutes) {
  if (minutes === 60) return "1H";
  if (minutes === 90) return "1H30";
  return "2H";
}

export default function ProposeSchedule() {
  const { matchId } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  // Set when the player got here by turning down a proposal — a "no" should
  // arrive with times attached, not empty.
  const cameFromDecline = !!useLocation().state?.counter;

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [conflictWarning, setConflictWarning] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  // Several slots can be offered at once, across days — the opponent picks
  // one. Kept as start timestamps so a pick survives switching days.
  const [picks, setPicks] = useState([]);
  const [duration, setDuration] = useState(null);
  const [court, setCourt] = useState("");
  const [editingCourt, setEditingCourt] = useState(false);

  useEffect(() => {
    api
      .getMatchDetail(matchId)
      .then((data) => {
        setDetail(data);
        setCourt(data.default_court || "");
      })
      .catch((err) => setError(err.message));
  }, [matchId]);

  if (error) return <p className="error">{t(error)}</p>;

  if (!detail) {
    return (
      <div>
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">{t("SCHEDULE")}</span>
        </div>
        <SkeletonBar width={200} height={32} style={{ marginTop: 18 }} />
      </div>
    );
  }

  const roundEnd = detail.round_number
    ? roundDueDateObj(detail.schedule_started_at, detail.round_number, detail.round_length_days || 7)
    : null;
  const days = buildDayOptions(roundEnd);
  const isFriendly = !detail.round_number;

  const busyWindows = (detail.busy_windows ?? []).map((w) => ({
    start: new Date(w.start).getTime(),
    end: new Date(w.end).getTime(),
    whose: w.whose,
  }));
  const gapMs = (detail.conflict_gap_minutes ?? 60) * 60000;
  const slotMinutes = isFriendly ? duration || 60 : detail.duration_minutes || 60;
  const stateFor = (day, time) => slotState(day, time, slotMinutes, busyWindows, gapMs);
  const freeSlotsOn = (day) =>
    TIME_SLOTS.filter((slot) => {
      const kind = stateFor(day, slot).kind;
      return kind === "free" || kind === "tight";
    }).length;

  const slotMs = (day, time) => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const picksOn = (day) => {
    const from = new Date(day).setHours(0, 0, 0, 0);
    const to = from + 86400000;
    return picks.filter((ms) => ms >= from && ms < to).length;
  };
  function togglePick(day, time) {
    const ms = slotMs(day, time);
    setPicks((prev) =>
      prev.includes(ms)
        ? prev.filter((x) => x !== ms)
        : prev.length >= MAX_PICKS
          ? prev
          : [...prev, ms]
    );
  }

  function slotNote(state) {
    if (state.kind === "past") return t("עבר");
    if (state.kind === "tight") return t("צמוד למשחק אחר");
    if (state.kind !== "busy") return null;
    if (state.whose === "me") return t("יש לך משחק");
    if (state.whose === "both") return t("שניכם תפוסים");
    return t("{name} תפוס", { name: detail.opponent.name });
  }

  async function handleSend(overrideConflictWarning = false) {
    if (picks.length === 0) return;
    if (isFriendly && !duration) return;
    setBusy(true);
    setError("");
    try {
      await api.proposeMatchSchedule(
        matchId,
        [...picks].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString()),
        court.trim() || null,
        {
          durationMinutes: isFriendly ? duration : null,
          overrideConflictWarning,
        }
      );
      navigate(-1);
    } catch (err) {
      if (err.status === 409) {
        setConflictWarning(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("SCHEDULE")}</span>
      </div>

      <h1 className="sched-title">{t("מול {name}", { name: detail.opponent.name })}</h1>
      <p className="sched-sub" dir="ltr">
        {detail.round_number ? (
          <>
            {hasHebrewChars(detail.league_name) ? (
              <span className="sched-sub-sans" dir="auto" style={{ unicodeBidi: "isolate" }}>
                {detail.league_name}
              </span>
            ) : (
              detail.league_name?.toUpperCase()
            )}{" "}
            · R{detail.round_number}
            {roundEnd &&
              (() => {
                const n = Math.max(0, Math.ceil((roundEnd.getTime() - Date.now()) / 86400000));
                return ` · ENDS IN ${n} ${daysWord(n)}`;
              })()}
          </>
        ) : (
          "FRIENDLY"
        )}
      </p>

      {error && <p className="error">{t(error)}</p>}

      {cameFromDecline && (
        <p className="sched-counter-note">{t("הזמן שהוצע לא התאים לך — סמן/י מתי כן, והיריב יבחר")}</p>
      )}

      <div className="sched-section-label">{t("DAY")}</div>
      <div className="sched-days">
        {days.map((d) => {
          const isSelected = selectedDay && d.getTime() === selectedDay.getTime();
          const nothingLeft = freeSlotsOn(d) === 0;
          return (
            <button
              type="button"
              key={d.getTime()}
              className={`sched-day${isSelected ? " on" : ""}${nothingLeft ? " off" : ""}`}
              disabled={nothingLeft}
              onClick={() => setSelectedDay(d)}
            >
              <span className="sched-day-weekday">{WEEKDAY_SHORT[d.getDay()]}</span>
              <span className="sched-day-date">{d.getDate()}</span>
              {picksOn(d) > 0 && <span className="sched-day-picks">{picksOn(d)}</span>}
            </button>
          );
        })}
      </div>

      <div className="sched-section-label">
        {t("TIME")}
        {picks.length > 0 && ` · ${picks.length}/${MAX_PICKS}`}
      </div>
      {picks.length < 2 && (
        <p className="sched-multi-hint">{t("אפשר לסמן כמה זמנים, והיריב יבחר אחד מהם")}</p>
      )}
      <div className="sched-times">
        {TIME_SLOTS.map((slot) => {
          const isSelected = selectedDay ? picks.includes(slotMs(selectedDay, slot)) : false;
          const state = selectedDay ? stateFor(selectedDay, slot) : { kind: "free" };
          const maxed = !isSelected && picks.length >= MAX_PICKS;
          const taken = state.kind === "past" || state.kind === "busy" || maxed;
          const note = slotNote(state);
          return (
            <button
              type="button"
              key={slot}
              className={`sched-time-row${isSelected ? " on" : ""}${taken ? " off" : ""}${
                state.kind === "tight" ? " tight" : ""
              }`}
              disabled={taken}
              onClick={() => togglePick(selectedDay, slot)}
            >
              <span dir="ltr">{slot}</span>
              <span className="sched-time-end">
                {note && <span className="sched-time-note">{note}</span>}
                {isSelected && <CheckIcon aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>

      {isFriendly && (
        <>
          <div className="sched-section-label">{t("DURATION")}</div>
          <div className="sched-durations">
            {DURATION_OPTIONS.map((mins) => (
              <button
                type="button"
                key={mins}
                className={`sched-duration${duration === mins ? " on" : ""}`}
                onClick={() => {
                  setDuration(mins);
                  // A longer match can run into a slot that was free at 1h.
                  setPicks((prev) =>
                    prev.filter((ms) => {
                      const d = new Date(ms);
                      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                      return slotState(d, time, mins, busyWindows, gapMs).kind !== "busy";
                    })
                  );
                }}
              >
                {t(durationLabel(mins))}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="sched-section-label">{t("COURT")}</div>
      <div className="sched-court-row">
        {editingCourt ? (
          <input
            type="text"
            className="sched-court-input"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            onBlur={() => setEditingCourt(false)}
            autoFocus
          />
        ) : (
          <span className="sched-court-value">{court || t("טרם נקבעה")}</span>
        )}
        <button type="button" className="sched-court-edit" onClick={() => setEditingCourt((v) => !v)}>
          EDIT
        </button>
      </div>

      <div className="sched-bottom">
        <button
          type="button"
          className="sched-send"
          disabled={picks.length === 0 || busy || (isFriendly && !duration)}
          onClick={() => handleSend(false)}
        >
          {picks.length > 1
            ? t("שלח {count} זמנים ל{name}", { count: picks.length, name: detail.opponent.name })
            : t("שלח הצעה ל{name}", { name: detail.opponent.name })}
        </button>
        <p className="sched-pending">
          {picks.length > 1 ? t("HE PICKS ONE · THEN IT IS SET") : t("HE CONFIRMS · THEN IT IS SET")}
        </p>
      </div>

      {conflictWarning && (
        <div className="confirm-sheet-overlay" onClick={() => setConflictWarning(null)}>
          <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-sheet-handle" />
            <div className="confirm-sheet-title">{t("שים לב")}</div>
            <p className="add-round-subtitle">{t(conflictWarning)}</p>
            <div className="add-round-actions">
              <button
                type="button"
                className="confirm-sheet-btn-confirm"
                disabled={busy}
                onClick={() => {
                  setConflictWarning(null);
                  handleSend(true);
                }}
              >
                {t("כן, לתאם בכל זאת")}
              </button>
              <button
                type="button"
                className="link-btn add-round-cancel"
                onClick={() => setConflictWarning(null)}
              >
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
