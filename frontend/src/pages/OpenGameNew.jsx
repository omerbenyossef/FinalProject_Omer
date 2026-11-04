import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSport } from "../SportContext.jsx";
import { usePairs } from "../PairContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon, CheckIcon } from "../Icons.jsx";
import VenueCard from "../VenueCard.jsx";
import { NTRP_STEPS, weekdayName } from "../matchUtils.js";

/* Opening a game, 189b.
   The handoff never said how a player opens one, and the first version of
   this was two bare inputs and a browser date picker. This is the same
   sequence the app already uses to agree a time for a match: where, how long,
   when, who — so opening a game and scheduling one feel like the same app.

   The level range is the one question this screen has that the scheduling
   screen does not, because a game is an offer to strangers rather than an
   arrangement with somebody you already picked. */

const DURATIONS = [60, 90, 120];
const LAST_SLOT = "24:00";
const DAYS_AHEAD = 10;

function buildSlots() {
  const slots = [];
  for (let h = 7; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  // Midnight is held as hour 24 so setHours rolls it into the next calendar
  // day by itself — "Thursday 00:00" is Thursday night (same rule as the
  // scheduling screen).
  slots.push(LAST_SLOT);
  return slots;
}
const TIME_SLOTS = buildSlots();
const slotLabel = (slot) => (slot === LAST_SLOT ? "00:00" : slot);

function slotDate(day, slot) {
  const [h, m] = slot.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

function durationLabel(minutes, t) {
  if (minutes === 60) return t("שעה");
  if (minutes === 90) return t("שעה וחצי");
  return t("שעתיים");
}

function Step({ n, children, hint, done }) {
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

export default function OpenGameNew() {
  const { selectedSportId, selectedSport } = useSport();
  const { activePairs } = usePairs();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [venues, setVenues] = useState([]);
  const [venuesLoaded, setVenuesLoaded] = useState(false);
  const [venueId, setVenueId] = useState(null);
  const [court, setCourt] = useState("");
  const [typingCourt, setTypingCourt] = useState(false);
  const [duration, setDuration] = useState(90);
  const [day, setDay] = useState(null);
  const [slot, setSlot] = useState(null);
  const [myLevel, setMyLevel] = useState(null);
  // "Around me" is the default because a game nobody at your level can take is
  // not an offer; "anyone" is one tap away.
  const [range, setRange] = useState("near");
  const [customMin, setCustomMin] = useState(null);
  const [customMax, setCustomMax] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isDoubles = !!selectedSport?.plays_in_pairs;
  const pair = activePairs[0] || null;

  useEffect(() => {
    if (!selectedSportId) return;
    api
      .venues(selectedSportId)
      .then(setVenues)
      .catch(() => setVenues([]))
      .finally(() => setVenuesLoaded(true));
    // /auth/me/stats carries no level; /ratings/me is where the player's own
    // level per sport lives.
    api
      .myRatings()
      .then((rows) => {
        const mine = (rows || []).find((r) => r.sport_id === selectedSportId);
        setMyLevel(mine?.level ?? null);
      })
      .catch(() => setMyLevel(null));
  }, [selectedSportId]);

  const days = useMemo(() => {
    const first = new Date();
    first.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(first);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const level = isDoubles ? pair?.level ?? null : myLevel;
  const near = level != null
    ? {
        min: Math.max(NTRP_STEPS[0], level - 0.5),
        max: Math.min(NTRP_STEPS[NTRP_STEPS.length - 1], level + 0.5),
      }
    : null;
  const chosen = venues.find((v) => v.id === venueId) || null;
  const place = chosen ? chosen.name : court.trim() || null;
  const when = day && slot ? slotDate(day, slot) : null;
  const ready = !!when && !busy;

  function rangeFor() {
    if (range === "any") return { level_min: NTRP_STEPS[0], level_max: NTRP_STEPS[NTRP_STEPS.length - 1] };
    if (range === "custom" && customMin != null && customMax != null)
      return { level_min: Math.min(customMin, customMax), level_max: Math.max(customMin, customMax) };
    // "near" is what the server does on its own when no range is sent, so it
    // stays the server's business rather than being computed twice.
    return {};
  }

  async function submit() {
    if (!when) return;
    setBusy(true);
    setError("");
    try {
      const game = await api.createOpenGame({
        sport_id: selectedSportId,
        starts_at: when.toISOString(),
        duration_minutes: duration,
        venue_id: chosen ? chosen.id : null,
        court: chosen ? null : court.trim() || null,
        ...rangeFor(),
      });
      navigate(game?.match_id ? `/matches/${game.match_id}` : "/games/open", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // A padel player with no pair cannot open a doubles game, and the server
  // says so — but there is no reason to let them fill the whole screen in
  // first.
  if (isDoubles && !pair) {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">{t("פתח משחק")}</span>
        </div>
        <h1 className="sched-title">{t("צריך פרטנר כדי להתחיל")}</h1>
        <p className="sched-sub">{t("בפאדל משחקים בזוגות, אז קודם מוצאים פרטנר ואז פותחים משחק.")}</p>
        <div className="sched-bottom">
          <button type="button" className="sched-send" onClick={() => navigate("/partners")}>
            {t("מצא שותף")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("פתח משחק")}</span>
      </div>

      <h1 className="sched-title">{t("פתח משחק")}</h1>
      <p className="sched-sub">
        {isDoubles
          ? t("אתם תופסים שני מקומות, וצמד נוסף משלים את המשחק.")
          : t("אתה תופס מקום אחד, ומי שמצטרף משלים את המשחק.")}
      </p>

      {/* Not t("מקום"): that key already means the standings rank elsewhere
          and resolves to "Rank" in English. */}
      <Step n={1} done={!!place}>
        {t("איפה משחקים")}
      </Step>
      {venuesLoaded && venues.length > 0 && !typingCourt ? (
        <>
          <div className="vp-cards">
            {venues.map((v) => (
              <VenueCard
                key={v.id}
                venue={v}
                selected={venueId === v.id}
                onChoose={() => {
                  setVenueId(v.id);
                  setCourt("");
                }}
                t={t}
              />
            ))}
          </div>
          <div className="vp-foot">
            <button type="button" className="vp-foot-other" onClick={() => { setTypingCourt(true); setVenueId(null); }}>
              {t("מקום אחר")}
            </button>
            <span className="vp-foot-sep" aria-hidden="true" />
            <button type="button" className="vp-foot-later" onClick={() => { setVenueId(null); setCourt(""); }}>
              {t("אבחר אחר כך")}
            </button>
          </div>
        </>
      ) : (
        <div className="sched-court-row">
          <input
            type="text"
            className="sched-court-input"
            value={court}
            onChange={(e) => {
              setCourt(e.target.value);
              setVenueId(null);
            }}
            placeholder={t("מקום אחר")}
            maxLength={120}
          />
          {venues.length > 0 && (
            <button type="button" className="sched-court-edit" onClick={() => setTypingCourt(false)}>
              {t("מהרשימה")}
            </button>
          )}
        </div>
      )}

      <Step n={2} done={!!duration}>
        {t("משך")}
      </Step>
      <div className="sched-durations">
        {DURATIONS.map((mins) => (
          <button
            type="button"
            key={mins}
            className={`sched-duration${duration === mins ? " on" : ""}`}
            onClick={() => setDuration(mins)}
          >
            {durationLabel(mins, t)}
          </button>
        ))}
      </div>

      <Step n={3} done={!!when} hint={t("מתי אתם רוצים לשחק")}>
        {t("יום ושעה")}
      </Step>
      <div className="sched-days">
        {days.map((d) => (
          <button
            type="button"
            key={d.getTime()}
            className={`sched-day${day && d.getTime() === day.getTime() ? " on" : ""}`}
            onClick={() => setDay(d)}
          >
            <span className="sched-day-weekday">{weekdayName(d, t)}</span>
            <span className="sched-day-date">{d.getDate()}</span>
          </button>
        ))}
      </div>
      <div className="sched-times">
        {TIME_SLOTS.map((s) => {
          // A slot is only offered if it is still ahead: a game cannot be
          // opened for this morning.
          const past = day ? slotDate(day, s) <= new Date() : false;
          return (
            <button
              type="button"
              key={s}
              className={`sched-time-row${slot === s ? " on" : ""}${past || !day ? " off" : ""}`}
              disabled={past || !day}
              onClick={() => setSlot(s)}
            >
              <span dir="ltr">{slotLabel(s)}</span>
              <span className="sched-time-end">{slot === s && <CheckIcon aria-hidden="true" />}</span>
            </button>
          );
        })}
      </div>

      <Step n={4} done hint={t("מי יכול להצטרף")}>
        {t("רמות")}
      </Step>
      <div className="sched-durations">
        <button
          type="button"
          className={`sched-duration${range === "near" ? " on" : ""}`}
          onClick={() => setRange("near")}
        >
          {near ? `NTRP ${near.min.toFixed(1)}–${near.max.toFixed(1)}` : t("הרמה שלי")}
        </button>
        <button
          type="button"
          className={`sched-duration${range === "any" ? " on" : ""}`}
          onClick={() => setRange("any")}
        >
          {t("כל הרמות")}
        </button>
        <button
          type="button"
          className={`sched-duration${range === "custom" ? " on" : ""}`}
          onClick={() => {
            setRange("custom");
            if (customMin == null) setCustomMin(near?.min ?? NTRP_STEPS[0]);
            if (customMax == null) setCustomMax(near?.max ?? NTRP_STEPS[NTRP_STEPS.length - 1]);
          }}
        >
          {t("טווח אחר")}
        </button>
      </div>
      {range === "custom" && (
        <div className="ogn-range">
          <label className="og-field">
            <span>{t("מרמה")}</span>
            <select value={customMin ?? ""} onChange={(e) => setCustomMin(Number(e.target.value))}>
              {NTRP_STEPS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv.toFixed(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="og-field">
            <span>{t("עד רמה")}</span>
            <select value={customMax ?? ""} onChange={(e) => setCustomMax(Number(e.target.value))}>
              {NTRP_STEPS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv.toFixed(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && <p className="error">{t(error)}</p>}

      <div className="sched-bottom">
        <div className="sched-recap">
          <span className={when ? undefined : "sched-recap-missing"} dir="auto">
            {when
              ? `${weekdayName(when, t)} ${when.getDate()}.${when.getMonth() + 1} · ${slotLabel(slot)}`
              : t("טרם נבחרה שעה")}
          </span>
          <span className="sched-recap-sep" aria-hidden="true">
            ·
          </span>
          <span className={place ? undefined : "sched-recap-missing"} dir="auto">
            {place || t("טרם נקבעה")}
          </span>
        </div>
        <button type="button" className="sched-send" disabled={!ready} onClick={submit}>
          {t("פתח משחק")}
        </button>
        <p className="sched-pending">{t("המשחק יופיע לכל מי שבטווח הרמות שבחרת")}</p>
      </div>
    </div>
  );
}
