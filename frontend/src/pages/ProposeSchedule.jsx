import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { useSport } from "../SportContext.jsx";
import BookCourtLink from "../BookCourtLink.jsx";
import { ChevronIcon, CheckIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { roundDueDateObj, hasHebrewChars, daysWord, weekdayName } from "../matchUtils.js";


function buildDayOptions(roundEndDate, roundStartDate) {
  // The window opens today, unless the match belongs to a round that hasn't
  // started yet — a match moved to a later round is played in that round.
  const first = new Date();
  first.setHours(0, 0, 0, 0);
  if (roundStartDate) {
    const start = new Date(roundStartDate);
    start.setHours(0, 0, 0, 0);
    if (start > first) first.setTime(start.getTime());
  }
  let count = 5;
  if (roundEndDate) {
    const end = new Date(roundEndDate);
    end.setHours(0, 0, 0, 0);
    const daysLeft = Math.floor((end - first) / 86400000) + 1;
    count = Math.max(1, Math.min(5, daysLeft));
  }
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Courts here are booked late — a match at 23:00 is ordinary — so the day runs
// to its own midnight. The last slot is held as hour 24 rather than 0 so that
// setHours rolls it into the next calendar day on its own: "Thursday 00:00" is
// Thursday night, not the small hours of Thursday morning.
const LAST_SLOT = "24:00";

function buildTimeSlots() {
  const slots = [];
  for (let h = 7; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  slots.push(LAST_SLOT);
  return slots;
}

const TIME_SLOTS = buildTimeSlots();

// 24:00 is midnight at the end of the day, and that is how it reads.
function slotLabel(slot) {
  return slot === LAST_SLOT ? "00:00" : slot;
}

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

// One time per proposal for now. The multi-slot machinery underneath still
// works — the server takes up to five and the opponent's screen can pick
// between them — so raising this is the only change needed to bring it back.
const MAX_PICKS = 1;

// The screen is a sequence, not a form: the court is booked on somebody
// else's site, so "check the hours there" has to come before "pick a time
// here", and sending to the opponent is the last thing that happens.
function StepLabel({ n, children, hint, done }) {
  return (
    <div className={`sched-step${done ? " done" : ""}`}>
      <span className="sched-step-head">
        <span className="sched-step-n" aria-hidden="true">
          {done ? <CheckIcon /> : n}
        </span>
        <span className="sched-step-title">{children}</span>
      </span>
      {hint && <span className="sched-step-hint">{hint}</span>}
    </div>
  );
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
  const location = useLocation();
  const { selectedSportId } = useSport();
  // Set when the player got here by turning down a proposal — a "no" should
  // arrive with times attached, not empty.
  const cameFromDecline = !!location.state?.counter;
  // Draft mode: an invitation that hasn't been sent, and has no match behind
  // it yet. The opponent rides in on router state; the match is created when
  // a time is actually picked, so leaving this screen sends nothing.
  const draftOpponent = matchId ? null : location.state?.opponent ?? null;
  // The conflict warning sends handleSend round a second time. In draft mode
  // the first pass has already created the invitation, so remember it —
  // otherwise confirming the warning would invite the same person twice.
  const draftMatchIdRef = useRef(null);

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
  // Venues the app knows, so "where" can be a choice with a booking link
  // behind it rather than a line of text nobody can act on.
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(null);
  const [editingCourt, setEditingCourt] = useState(false);

  useEffect(() => {
    if (!selectedSportId) return;
    api.venues(selectedSportId).then(setVenues).catch(() => setVenues([]));
  }, [selectedSportId]);

  useEffect(() => {
    if (draftOpponent) {
      api
        .friendlyDraft(draftOpponent.id)
        .then((data) =>
          // Shaped like a match detail so everything below this point stays
          // one code path: a friendly has no round, no league and no court to
          // inherit, which is exactly what those nulls say.
          setDetail({
            ...data,
            id: null,
            kind: "friendly",
            round_number: null,
            league_id: null,
            league_name: null,
            duration_minutes: null,
            default_court: null,
            time_options: [],
          })
        )
        .catch((err) => setError(err.message));
      return;
    }
    api
      .getMatchDetail(matchId)
      .then((data) => {
        setDetail(data);
        setCourt(data.default_court || "");
      })
      .catch((err) => setError(err.message));
  }, [matchId, draftOpponent]);

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

  const roundStart =
    detail.round_number && detail.round_number > 1
      ? (() => {
          const previousEnd = roundDueDateObj(
            detail.schedule_started_at,
            detail.round_number - 1,
            detail.round_length_days || 7
          );
          if (!previousEnd) return null;
          const start = new Date(previousEnd);
          start.setDate(start.getDate() + 1);
          return start;
        })()
      : null;
  const roundEnd = detail.round_number
    ? roundDueDateObj(detail.schedule_started_at, detail.round_number, detail.round_length_days || 7)
    : null;
  const days = buildDayOptions(roundEnd, roundStart);
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
    // Inclusive of the closing midnight: that instant is this day's last slot,
    // and no other day offers it (every day starts at 07:00).
    const to = from + 86400000;
    return picks.filter((ms) => ms >= from && ms <= to).length;
  };
  function togglePick(day, time) {
    const ms = slotMs(day, time);
    setPicks((prev) => {
      if (prev.includes(ms)) return prev.filter((x) => x !== ms);
      // At one pick, tapping another time means "that one instead" — being
      // told the limit is reached and having to un-tap first is a worse
      // answer than simply moving the pick.
      if (MAX_PICKS === 1) return [ms];
      return prev.length >= MAX_PICKS ? prev : [...prev, ms];
    });
  }

  function slotNote(state) {
    if (state.kind === "past") return t("עבר");
    if (state.kind === "tight") return t("צמוד למשחק אחר");
    if (state.kind !== "busy") return null;
    if (state.whose === "me") return t("יש לך משחק");
    if (state.whose === "both") return t("שניכם תפוסים");
    return t("{name} תפוס", { name: detail.opponent.name });
  }

  // Steps are numbered as they are shown, and a friendly has one more of
  // them than a league match does.
  const timeStep = isFriendly ? 3 : 2;
  const sendStep = timeStep + 1;

  // What the send button is about to say, in words rather than in state.
  const pickedLabel =
    picks.length === 1
      ? (() => {
          const d = new Date(picks[0]);
          const hh = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          return `${weekdayName(d, t)} ${d.getDate()}.${d.getMonth() + 1} · ${hh}`;
        })()
      : picks.length > 1
      ? t("{count} זמנים", { count: picks.length })
      : null;
  const placeLabel = venueId ? venues.find((v) => v.id === venueId)?.name : court.trim() || null;

  async function handleSend(overrideConflictWarning = false) {
    if (picks.length === 0) return;
    if (isFriendly && !duration) return;
    setBusy(true);
    setError("");
    try {
      let targetId = matchId;
      if (draftOpponent) {
        // Now there is a time, so now there is an invitation. It is created
        // silently — the propose call right after is what reaches the
        // opponent, as one message with the time in it.
        if (draftMatchIdRef.current == null) {
          const created = await api.createFriendlyInvite(draftOpponent.id, selectedSportId, {
            deferNotification: true,
          });
          draftMatchIdRef.current = created.id;
        }
        targetId = draftMatchIdRef.current;
      }
      await api.proposeMatchSchedule(
        targetId,
        [...picks].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString()),
        court.trim() || null,
        {
          durationMinutes: isFriendly ? duration : null,
          overrideConflictWarning,
          venueId,
        }
      );
      navigate(draftOpponent ? "/needs-you" : -1, draftOpponent ? { replace: true } : undefined);
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
        {/* A match with no time yet is exactly when "when can you play?" needs
            somewhere to be asked. Not on a draft invitation, which has no
            match behind it to talk about yet. */}
        {!draftOpponent && (
          <button
            type="button"
            className="sched-nav-chat"
            onClick={() => navigate(`/matches/${matchId}/chat`)}
          >
            {t("צ'אט")}
            {detail.unread_messages > 0 && (
              <span className="sched-nav-chat-dot" aria-hidden="true" />
            )}
          </button>
        )}
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
            · {t("מחזור {n}", { n: detail.round_number })}
            {roundEnd &&
              (() => {
                const n = Math.max(0, Math.ceil((roundEnd.getTime() - Date.now()) / 86400000));
                return ` · ${t("נסגר בעוד")} ${n} ${daysWord(n, t)}`;
              })()}
          </>
        ) : (
          t("ידידותי")
        )}
      </p>

      {error && <p className="error">{t(error)}</p>}

      {cameFromDecline && (
        <p className="sched-counter-note">{t("הזמן שהוצע לא התאים לך — סמן/י מתי כן, והיריב יבחר")}</p>
      )}

      {/* 1 · where. The court is booked on the venue's own site, so looking at
          its hours has to come before picking a time here — a time chosen
          against a court nobody checked is a time that falls through. */}
      <StepLabel
        n={1}
        done={!!venueId || !!court.trim()}
        hint={t("בחרו מגרש, ובדקו אצלו אילו שעות פנויות")}
      >
        {t("מקום")}
      </StepLabel>
      {venues.length > 0 && (
        <div className="venue-list">
          {venues.map((v) => (
            <div className={`venue-row${venueId === v.id ? " on" : ""}`} key={v.id}>
              {/* Tapping the name chooses this venue for the match. */}
              <button
                type="button"
                className="venue-row-pick"
                onClick={() => {
                  setVenueId(venueId === v.id ? null : v.id);
                  setCourt("");
                  setEditingCourt(false);
                }}
              >
                <span className="venue-row-name" dir="auto">
                  {v.name}
                </span>
                {v.area && <span className="venue-row-area">{v.area}</span>}
              </button>
              {/* And "hours" only looks. Checking three venues before finding
                  a free slot must not commit you to the first one you opened. */}
              {v.booking_url && (
                <BookCourtLink className="venue-row-hours" url={v.booking_url}>
                  {t("שעות")} ↗
                </BookCourtLink>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Anywhere that isn't on the list is still allowed — it just doesn't
          come with a way to book it. */}
      <div className="sched-court-row">
        {editingCourt ? (
          <input
            type="text"
            className="sched-court-input"
            value={court}
            onChange={(e) => {
              setCourt(e.target.value);
              setVenueId(null);
            }}
            onBlur={() => setEditingCourt(false)}
            placeholder={t("מקום אחר")}
            autoFocus
          />
        ) : (
          <span className="sched-court-value">
            {venueId
              ? venues.find((v) => v.id === venueId)?.name
              : court || t("טרם נקבעה")}
          </span>
        )}
        <button type="button" className="sched-court-edit" onClick={() => setEditingCourt((v) => !v)}>
          {venueId ? t("מקום אחר") : t("עריכה")}
        </button>
      </div>

      {/* 2 · how long, for a friendly — it decides which slots are even
          offered below, so it is asked before the grid, not after it. */}
      {isFriendly && (
        <>
          <StepLabel n={2} done={!!duration}>
            {t("משך")}
          </StepLabel>
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

      {/* 3 · when. */}
      <StepLabel
        n={timeStep}
        done={picks.length > 0}
        hint={
          MAX_PICKS > 1
            ? t("אפשר לסמן כמה זמנים, והיריב יבחר אחד מהם")
            : t("סמנו את השעה שמצאתם, והיריב יאשר אותה")
        }
      >
        {t("יום ושעה")}
      </StepLabel>
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
              <span className="sched-day-weekday">{weekdayName(d, t)}</span>
              <span className="sched-day-date">{d.getDate()}</span>
              {picksOn(d) > 0 && <span className="sched-day-picks">{picksOn(d)}</span>}
            </button>
          );
        })}
      </div>
      <div className="sched-times">
        {TIME_SLOTS.map((slot) => {
          const isSelected = selectedDay ? picks.includes(slotMs(selectedDay, slot)) : false;
          const state = selectedDay ? stateFor(selectedDay, slot) : { kind: "free" };
          const maxed = MAX_PICKS > 1 && !isSelected && picks.length >= MAX_PICKS;
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
              <span dir="ltr">{slotLabel(slot)}</span>
              <span className="sched-time-end">
                {note && <span className="sched-time-note">{note}</span>}
                {isSelected && <CheckIcon aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4 · and only now does anything leave the app. */}
      <StepLabel n={sendStep}>{t("שליחה")}</StepLabel>
      <div className="sched-bottom">
        {/* Spelled out, because everything above it was chosen in pieces and
            on two different sites. */}
        <div className="sched-recap">
          <span className={pickedLabel ? undefined : "sched-recap-missing"} dir="auto">
            {pickedLabel || t("טרם נבחרה שעה")}
          </span>
          <span className="sched-recap-sep" aria-hidden="true">
            ·
          </span>
          <span className={placeLabel ? undefined : "sched-recap-missing"} dir="auto">
            {placeLabel || t("טרם נקבעה")}
          </span>
        </div>
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
