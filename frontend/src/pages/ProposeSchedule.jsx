import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  const [venuesLoaded, setVenuesLoaded] = useState(false);
  const [venueId, setVenueId] = useState(null);
  const [editingCourt, setEditingCourt] = useState(false);
  const [venueSearch, setVenueSearch] = useState("");

  useEffect(() => {
    if (!selectedSportId) return;
    api
      .venues(selectedSportId)
      .then(setVenues)
      .catch(() => setVenues([]))
      .finally(() => setVenuesLoaded(true));
  }, [selectedSportId]);

  // Where comes before when, and each half is its own screen — the list of
  // courts is long, and reading it means leaving for the venue's own site and
  // coming back. Kept in the URL so the phone's back button walks the same
  // path the player walked, and so every existing link into this screen still
  // lands on its first step.
  const [searchParams, setSearchParams] = useSearchParams();
  const askedForWhen = searchParams.get("step") === "when";
  // Nothing to choose from is not a step.
  const phase = askedForWhen || (venuesLoaded && venues.length === 0) ? "when" : "where";
  function goToWhere() {
    setSearchParams({}, { state: location.state });
  }
  function goToWhen(opts = {}) {
    if (opts.venue !== undefined) setVenueId(opts.venue);
    if (opts.venue) setCourt("");
    setEditingCourt(!!opts.freeText);
    setSearchParams({ step: "when" }, { state: location.state });
  }

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
          <span className="sched-nav-label">{t("הזנת זמן")}</span>
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
  const chosenVenue = venueId ? venues.find((v) => v.id === venueId) ?? null : null;
  const placeLabel = chosenVenue ? chosenVenue.name : court.trim() || null;

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
          venueId,
        }
      );
      // Back to the match, not back through the steps: what changed is the
      // match's state, and going -1 can land on the venue list again.
      navigate(`/matches/${matchId}`, { replace: true });
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

  const header = (
    <>
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("הזנת זמן")}</span>
        {/* The conversation that produced this time is one tap away, because
            it is where any correction to it will happen too. */}
        <button
          type="button"
          className="sched-nav-chat"
          onClick={() => navigate(`/matches/${matchId}/chat`)}
        >
          {t("צ'אט")}
          {detail.unread_messages > 0 && <span className="sched-nav-chat-dot" aria-hidden="true" />}
        </button>
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
    </>
  );

  // The first half of the screen is its own screen: the list of courts is long,
  // and reading it means stepping out to the venue's own site and coming back.
  // Picking one lands on the second half with it already chosen.
  if (phase === "where") {
    const needle = venueSearch.trim().toLowerCase();
    const filtered = needle
      ? venues.filter((v) => `${v.name} ${v.area ?? ""}`.toLowerCase().includes(needle))
      : venues;
    // Grouped by area, because "all the courts" is a list you read by
    // neighbourhood — the one nearest you is the one you can actually reach.
    const areas = [];
    for (const v of filtered) {
      const key = v.area?.trim() || t("מקומות נוספים");
      const group = areas.find((g) => g.key === key);
      if (group) group.items.push(v);
      else areas.push({ key, items: [v] });
    }
    return (
      <div className="sched-page">
        {header}
        <StepLabel n={1} hint={t("בדקו מתי המגרש פנוי, ואז בחרו אותו — היום והשעה במסך הבא")}>
          {t("מקום")}
        </StepLabel>
        {venues.length > 6 && (
          <input
            type="search"
            className="venue-search"
            value={venueSearch}
            onChange={(e) => setVenueSearch(e.target.value)}
            placeholder={t("חיפוש מגרש")}
          />
        )}
        {areas.map((g) => (
          <div key={g.key}>
            <div className="venue-group">{g.key}</div>
            <div className="venue-list">
              {g.items.map((v) => (
                <div className={`venue-row${venueId === v.id ? " on" : ""}`} key={v.id}>
                  {/* Tapping the name takes this venue to the next screen. */}
                  <button
                    type="button"
                    className="venue-row-pick"
                    onClick={() => goToWhen({ venue: v.id })}
                  >
                    <span className="venue-row-name" dir="auto">
                      {v.name}
                    </span>
                  </button>
                  {/* And "hours" only looks. Checking three venues before
                      finding a free slot must not commit you to the first one
                      you opened. */}
                  {v.booking_url && (
                    <BookCourtLink className="venue-row-hours" url={v.booking_url}>
                      {t("שעות")} ↗
                    </BookCourtLink>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="venue-empty">{t("אין מגרש בשם הזה")}</p>}
        {/* Anywhere that isn't on the list is still allowed — it just doesn't
            come with a way to book it. And "later" is a real answer too. */}
        <div className="venue-escape">
          <button
            type="button"
            className="venue-escape-btn"
            onClick={() => goToWhen({ venue: null, freeText: true })}
          >
            {t("מקום אחר")}
          </button>
          <button
            type="button"
            className="link-btn venue-escape-skip"
            onClick={() => goToWhen({ venue: null })}
          >
            {t("אבחר מקום אחר כך")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sched-page">
      {header}

      {/* 1 · where, already chosen on the screen before this one. It stays
          visible and changeable — the time is picked against it. */}
      <StepLabel n={1} done={!!venueId || !!court.trim()}>
        {t("מקום")}
      </StepLabel>
      {editingCourt ? (
        <div className="sched-court-row">
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
          <button type="button" className="sched-court-edit" onClick={() => setEditingCourt(false)}>
            {t("סיום")}
          </button>
        </div>
      ) : (
        <div className="venue-chosen">
          <div className="venue-chosen-main">
            <span className={placeLabel ? "venue-chosen-name" : "venue-chosen-name is-empty"} dir="auto">
              {placeLabel || t("טרם נקבעה")}
            </span>
            {chosenVenue?.area && <span className="venue-row-area">{chosenVenue.area}</span>}
          </div>
          {chosenVenue?.booking_url && (
            <BookCourtLink className="venue-row-hours" url={chosenVenue.booking_url}>
              {t("שעות")} ↗
            </BookCourtLink>
          )}
          {/* With a list to go back to, "change" means the list. Without one,
              there is nothing to go back to and the only place to say is
              typed here. */}
          <button
            type="button"
            className="sched-court-edit"
            onClick={() => (venues.length > 0 ? goToWhere() : setEditingCourt(true))}
          >
            {venues.length > 0 ? t("החלף") : t("עריכה")}
          </button>
        </div>
      )}

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
            : t("סמנו את השעה שסיכמתם בצ'אט, והיריב יאשר אותה")
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
            : t("שלח ל{name} לאישור", { name: detail.opponent.name })}
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
