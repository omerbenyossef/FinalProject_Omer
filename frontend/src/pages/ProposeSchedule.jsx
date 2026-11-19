import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { useSport } from "../SportContext.jsx";
import BookCourtLink from "../BookCourtLink.jsx";
import VenueCard from "../VenueCard.jsx";
import { ChevronDownIcon, ChevronIcon, CheckIcon, SearchIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { detailOpponent, monthName, roundDueDateObj, weekdayName } from "../matchUtils.js";


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


// One venue, as a card you can look at. The old row had two tap targets side
// by side with nothing to tell them apart — "hours" only looked, the name
// chose, and both were just text. Here they are two labelled buttons under a
// photograph of the place.
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

// The shared weekday and month labels are stored in capitals for the screens
// that set them in mono. Here they are words in a sentence.
function sentenceCase(label) {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

// A weekday says which day only inside the coming week; past that the date
// says it.
function dayLabel(date, t) {
  const days = Math.round(
    (new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000
  );
  if (days > 7 || days < 0)
    return `${date.getDate()} ${sentenceCase(monthName(date, t))}`;
  return sentenceCase(weekdayName(date, t));
}

// How far from the asked-for time the search will look. "All day" is the
// whole of the day's slots, which is why it carries no window at all.
const FLEX_OPTIONS = [30, 60, 120, 0];
function flexLabel(mins, t, language) {
  if (mins === 0) return t("כל היום");
  if (mins === 30) return language === "en" ? "30 min" : t("30 דק׳");
  if (mins === 60) return language === "en" ? "1 hr" : t("שעה");
  return language === "en" ? "2 hr" : t("שעתיים");
}

function lengthLabel(mins, t, language) {
  if (language === "en") {
    if (mins === 60) return "1 hr";
    if (mins === 90) return "1.5 hr";
    if (mins === 120) return "2 hr";
    return `${mins} min`;
  }
  if (mins === 60) return t("שעה");
  if (mins === 90) return t("שעה וחצי");
  if (mins === 120) return t("שעתיים");
  return `${mins} ${t("דק׳")}`;
}

const RESULT_COUNT = 4;

const DURATION_OPTIONS = [60, 90, 120];
function durationLabel(minutes) {
  if (minutes === 60) return "1H";
  if (minutes === 90) return "1H30";
  return "2H";
}

export default function ProposeSchedule() {
  const { matchId } = useParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedSportId } = useSport();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [conflictWarning, setConflictWarning] = useState(null);
  const [busy, setBusy] = useState(false);
  // Several slots can be offered at once, across days — the opponent picks
  // one. Kept as start timestamps so a pick survives switching days.
  const [picks, setPicks] = useState([]);
  const [duration, setDuration] = useState(null);
  // The search: a day (or any), a time to aim at, and how far around it to
  // look. The list of every half hour in the day is gone — nobody reads
  // thirty-four rows to find the three that are free.
  const [dayChoice, setDayChoice] = useState("any");
  const [around, setAround] = useState("18:00");
  const [flex, setFlex] = useState(60);
  const [openField, setOpenField] = useState(null);
  const [results, setResults] = useState(null);
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
  const slotMs = (day, time) => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  // The search. Candidates are the free half hours inside the window around
  // the asked-for time, nearest first; ties go to the earlier one, which on
  // "any day" is also the sooner day.
  function runSearch(nextFlex = flex, nextDay = dayChoice) {
    const [ah, am] = around.split(":").map(Number);
    const scan = nextDay === "any" ? days : days.filter((d) => d.getTime() === nextDay);
    const windowMs = nextFlex === 0 ? null : nextFlex * 60000;
    const out = [];
    const firstDay = scan.length ? scan[0].getTime() : null;
    for (const day of scan) {
      const target = new Date(day);
      target.setHours(ah, am, 0, 0);
      for (const slot of TIME_SLOTS) {
        const state = stateFor(day, slot);
        if (state.kind === "past" || state.kind === "busy") continue;
        const ms = slotMs(day, slot);
        const dist = Math.abs(ms - target.getTime());
        if (windowMs !== null && dist > windowMs) continue;
        out.push({
          ms,
          slot,
          dist,
          exact: dist === 0 && day.getTime() === (nextDay === "any" ? firstDay : nextDay),
        });
      }
    }
    out.sort((a, b) => a.dist - b.dist || a.ms - b.ms);
    const top = out.slice(0, RESULT_COUNT);
    setResults(top);
    setPicks(top.length ? [top[0].ms] : []);
    setOpenField(null);
  }

  // Nothing, or not much: offer the one step that would widen it, in the
  // order that costs the reader least.
  const widen =
    flex !== 0 && flex < 120
      ? {
          label: t("לנסות {flex}", { flex: flexLabel(120, t, language) }),
          run: () => {
            setFlex(120);
            runSearch(120, dayChoice);
          },
        }
      : flex !== 0
        ? {
            label: t("לנסות {flex}", { flex: flexLabel(0, t, language) }),
            run: () => {
              setFlex(0);
              runSearch(0, dayChoice);
            },
          }
        : dayChoice !== "any"
          ? {
              label: t("לנסות כל יום"),
              run: () => {
                setDayChoice("any");
                runSearch(flex, "any");
              },
            }
          : null;

  // Steps are numbered as they are shown, and a friendly has one more of
  // them than a league match does.
  const timeStep = isFriendly ? 3 : 2;

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

      <h1 className="sched-title">{t("מול {name}", { name: detailOpponent(detail).label })}</h1>
      <p className="sched-sub" dir="ltr">
        {detail.round_number ? (
          <>
            <span dir="auto" style={{ unicodeBidi: "isolate" }}>
              {detail.league_name}
            </span>
            {` · ${sentenceCase(t("מחזור {n}", { n: detail.round_number }))}`}
            {roundEnd && ` · ${t("נסגר {day}", { day: dayLabel(roundEnd, t) })}`}
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
      <div className="vp-page">
        {/* Its own header: the big title and the league line belong to the
            "when" screen, which is where the match's details matter. Here the
            screen is a list, and the list should start near the top. */}
        <div className="vp-head">
          <button
            type="button"
            className="vp-back"
            onClick={() => navigate(-1)}
            aria-label={t("חזרה")}
          >
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="vp-head-title" dir="auto">
            {t("הזנת זמן · מול {name}", { name: detailOpponent(detail).label })}
          </span>
          <button
            type="button"
            className="vp-chat"
            onClick={() => navigate(`/matches/${matchId}/chat`)}
          >
            {t("צ'אט")}
            {detail.unread_messages > 0 && <span className="sched-nav-chat-dot" aria-hidden="true" />}
          </button>
        </div>

        <div className="vp-step">
          <span className="vp-step-n" aria-hidden="true">
            1
          </span>
          <h1 className="vp-step-title">{t("בחרו מגרש")}</h1>
        </div>

        {venues.length > 6 && (
          <div className="vp-search">
            <SearchIcon className="vp-search-icon" aria-hidden="true" />
            <input
              type="search"
              value={venueSearch}
              onChange={(e) => setVenueSearch(e.target.value)}
              placeholder={t("חיפוש מגרש או אזור")}
            />
          </div>
        )}

        <div className="vp-list">
          {areas.map((g) => (
            <div key={g.key}>
              <div className="vp-area">{g.key}</div>
              <div className="vp-cards">
                {g.items.map((v) => (
                  <VenueCard
                    key={v.id}
                    venue={v}
                    selected={venueId === v.id}
                    onChoose={() => goToWhen({ venue: v.id })}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="venue-empty">{t("אין מגרש בשם הזה")}</p>}
        </div>

        {/* Anywhere that isn't on the list is still allowed — it just doesn't
            come with a way to book it. And "later" is a real answer too. */}
        <div className="vp-foot">
          <button
            type="button"
            className="vp-foot-other"
            onClick={() => goToWhen({ venue: null, freeText: true })}
          >
            {t("מקום אחר")}
          </button>
          <span className="vp-foot-sep" aria-hidden="true" />
          <button
            type="button"
            className="vp-foot-later"
            onClick={() => goToWhen({ venue: null })}
          >
            {t("אבחר אחר כך")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sched-page ft-page">
      {header}

      {/* 1 · where, already chosen on the screen before this one. It stays
          visible and changeable — the time is picked against it. */}
      <StepLabel n={1} done={!!venueId || !!court.trim()}>
        {t("המגרש")}
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

      {/* 3 · when. Not a list of every half hour in the day — a search.
          The question somebody arrives with is "can we play around six",
          and the answer is the few free slots nearest to that, not
          thirty-four rows to read. */}
      <StepLabel n={timeStep} done={false}>
        {t("מצא זמן")}
      </StepLabel>
      {results === null && (
        <p className="ft-hint">{t("בחרו יום ושעה. נציג את 4 הזמנים הפנויים הקרובים ביותר.")}</p>
      )}

      <div className="ft-days">
        <button
          type="button"
          className={`ft-day${dayChoice === "any" ? " on" : ""}`}
          onClick={() => setDayChoice("any")}
        >
          <span className="ft-day-word">{t("כל יום")}</span>
        </button>
        {days.map((d) => (
          <button
            type="button"
            key={d.getTime()}
            className={`ft-day${dayChoice === d.getTime() ? " on" : ""}`}
            onClick={() => setDayChoice(d.getTime())}
          >
            <span className="ft-day-word">{sentenceCase(weekdayName(d, t))}</span>
            <span className="ft-day-num">{d.getDate()}</span>
          </button>
        ))}
      </div>

      <div className="ft-fields">
        <div className="ft-field-wrap">
          <button
            type="button"
            className={`ft-field${openField === "around" ? " is-open" : ""}`}
            onClick={() => setOpenField(openField === "around" ? null : "around")}
          >
            <span className="ft-field-text">
              <span className="ft-field-label">{t("בסביבות")}</span>
              <span className="ft-field-value" dir="ltr">
                {around}
              </span>
            </span>
            <ChevronDownIcon aria-hidden="true" />
          </button>
          {openField === "around" && (
            <div className="ft-menu ft-menu--tall">
              {TIME_SLOTS.filter((x) => x !== LAST_SLOT).map((slot) => (
                <button
                  type="button"
                  key={slot}
                  className={`ft-menu-row${around === slot ? " on" : ""}`}
                  onClick={() => {
                    setAround(slot);
                    setOpenField(null);
                  }}
                >
                  <span dir="ltr">{slot}</span>
                  {around === slot && <CheckIcon aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ft-field-wrap">
          <button
            type="button"
            className={`ft-field${openField === "flex" ? " is-open" : ""}`}
            onClick={() => setOpenField(openField === "flex" ? null : "flex")}
          >
            <span className="ft-field-text">
              <span className="ft-field-label">{t("גמישות")}</span>
              <span className="ft-field-value">{flexLabel(flex, t, language)}</span>
            </span>
            <ChevronDownIcon aria-hidden="true" />
          </button>
          {openField === "flex" && (
            <div className="ft-menu">
              {FLEX_OPTIONS.map((mins) => (
                <button
                  type="button"
                  key={mins}
                  className={`ft-menu-row${flex === mins ? " on" : ""}`}
                  onClick={() => {
                    setFlex(mins);
                    setOpenField(null);
                  }}
                >
                  <span>{flexLabel(mins, t, language)}</span>
                  {flex === mins && <CheckIcon aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {results !== null && (
        <>
          <div className="ft-results-head">
            <span className="ft-results-title">{t("הזמנים הפנויים הקרובים")}</span>
            <button type="button" className="ft-again" onClick={() => setResults(null)}>
              {t("חיפוש מחדש")}
            </button>
          </div>

          {results.length === 0 ? (
            <p className="ft-none">{t("אין זמן פנוי בסביבות {time}", { time: around })}</p>
          ) : (
            <div className="ft-slots">
              {results.map((r) => {
                const on = picks.includes(r.ms);
                const at = new Date(r.ms);
                return (
                  <button
                    type="button"
                    key={r.ms}
                    className={`ft-slot${on ? " on" : ""}`}
                    onClick={() => setPicks([r.ms])}
                  >
                    <span className="ft-slot-time" dir="ltr">
                      {slotLabel(r.slot)}
                    </span>
                    <span className="ft-slot-text">
                      <span className="ft-slot-day">
                        {`${sentenceCase(weekdayName(at, t))} ${at.getDate()}`}
                        {r.exact && <span className="ft-exact">{t("בדיוק")}</span>}
                      </span>
                      <span className="ft-slot-sub" dir="auto">
                        {[placeLabel, lengthLabel(slotMinutes, t, language)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="ft-radio" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}

          {/* One step wider, when the search came back short. */}
          {results.length < RESULT_COUNT && widen && (
            <button type="button" className="ft-widen" onClick={widen.run}>
              {widen.label}
            </button>
          )}
        </>
      )}

      {/* 4 · and only now does anything leave the app. */}
      <div className="sched-bottom">
        {results === null || picks.length === 0 ? (
          <button
            type="button"
            className="sched-send"
            disabled={isFriendly && !duration}
            onClick={() => runSearch()}
          >
            {t("מצא זמנים")}
          </button>
        ) : (
          <button
            type="button"
            className="sched-send"
            disabled={busy || (isFriendly && !duration)}
            onClick={() => handleSend(false)}
          >
            {t("שלח ל{name} · {when}", {
              name: (detailOpponent(detail).label || "").trim().split(/\s+/)[0],
              when: (() => {
                const d = new Date(picks[0]);
                const hh = `${String(d.getHours()).padStart(2, "0")}:${String(
                  d.getMinutes()
                ).padStart(2, "0")}`;
                return `${sentenceCase(weekdayName(d, t))} ${hh}`;
              })(),
            })}
          </button>
        )}
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
