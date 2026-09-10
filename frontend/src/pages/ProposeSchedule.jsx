import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [conflictWarning, setConflictWarning] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
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

  function slotNote(state) {
    if (state.kind === "past") return t("עבר");
    if (state.kind === "tight") return t("צמוד למשחק אחר");
    if (state.kind !== "busy") return null;
    if (state.whose === "me") return t("יש לך משחק");
    if (state.whose === "both") return t("שניכם תפוסים");
    return t("{name} תפוס", { name: detail.opponent.name });
  }

  async function handleSend(overrideConflictWarning = false) {
    if (!selectedDay || !selectedTime) return;
    if (isFriendly && !duration) return;
    setBusy(true);
    setError("");
    try {
      const [h, m] = selectedTime.split(":").map(Number);
      const dt = new Date(selectedDay);
      dt.setHours(h, m, 0, 0);
      await api.proposeMatchSchedule(matchId, dt.toISOString(), court.trim() || null, {
        durationMinutes: isFriendly ? duration : null,
        overrideConflictWarning,
      });
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
              onClick={() => {
                setSelectedDay(d);
                // Keep the picked hour only if it's still open on the new day.
                if (selectedTime && stateFor(d, selectedTime).kind !== "free") setSelectedTime(null);
              }}
            >
              <span className="sched-day-weekday">{WEEKDAY_SHORT[d.getDay()]}</span>
              <span className="sched-day-date">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="sched-section-label">{t("TIME")}</div>
      <div className="sched-times">
        {TIME_SLOTS.map((slot) => {
          const isSelected = selectedTime === slot;
          const state = selectedDay ? stateFor(selectedDay, slot) : { kind: "free" };
          const taken = state.kind === "past" || state.kind === "busy";
          const note = slotNote(state);
          return (
            <button
              type="button"
              key={slot}
              className={`sched-time-row${isSelected ? " on" : ""}${taken ? " off" : ""}${
                state.kind === "tight" ? " tight" : ""
              }`}
              disabled={taken}
              onClick={() => setSelectedTime(slot)}
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
                  if (
                    selectedDay &&
                    selectedTime &&
                    slotState(selectedDay, selectedTime, mins, busyWindows, gapMs).kind === "busy"
                  ) {
                    setSelectedTime(null);
                  }
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
          disabled={!selectedDay || !selectedTime || busy || (isFriendly && !duration)}
          onClick={() => handleSend(false)}
        >
          {t("שלח הצעה ל{name}", { name: detail.opponent.name })}
        </button>
        <p className="sched-pending">{t("HE CONFIRMS · THEN IT IS SET")}</p>
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
