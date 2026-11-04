import { useLanguage } from "./LanguageContext.jsx";
import { CalendarIcon, CheckIcon, PinIcon } from "./Icons.jsx";
import { formatDayMonth, weekdayFull } from "./matchUtils.js";

/* 193a — an open league, as a card you can join from.
   It replaces a one-line row whose only verb was "look at this". The card
   answers the questions somebody deciding whether to join actually asks: who
   opened it, when it starts, how long it runs, where, how full it is, and
   whether their own level is inside its range.

   Several of those are optional on a league (a start date, a round count, a
   place, a capacity), and a card that printed empty labels for the missing
   ones would be worse than one that leaves them out — so every line here is
   conditional on having something to say. */

export default function OpenLeagueCard({ league, myLevel, onJoin, onOpen, busy, joined }) {
  const { t } = useLanguage();

  const min = league.level_min ?? 1.5;
  const max = league.level_max ?? 7;
  const inRange = myLevel != null && min <= myLevel && myLevel <= max;

  const capacity = league.capacity ?? null;
  const taken = league.member_count ?? 0;
  const left = capacity != null ? Math.max(0, capacity - taken) : null;

  const start = league.starts_at ? new Date(league.starts_at) : null;
  const daysToStart = start ? Math.ceil((start - Date.now()) / 86400000) : null;

  // "מתחילה שבת 12.04 · 6 מחזורים · שבועי" — minus whichever of those the
  // league has not been told.
  const whenParts = [];
  if (start) whenParts.push(t("מתחילה {day} {date}", { day: weekdayFull(start, t), date: formatDayMonth(start) }));
  if (league.planned_rounds) whenParts.push(t("{n} מחזורים", { n: league.planned_rounds }));
  whenParts.push(league.round_length_days === 14 ? t("כל שבועיים") : t("שבועי"));

  /* The pill carries whichever urgency the card has not already stated. The
     spots line above it already says how many are left, so when both apply
     the pill takes the date — otherwise the card said "2 spots left" twice,
     once under the bar and once in the pill beneath it. */
  let urgency = null;
  if (daysToStart != null && daysToStart > 0 && daysToStart <= 14)
    urgency = daysToStart === 1 ? t("מתחילה מחר") : t("מתחילה בעוד {n} ימים", { n: daysToStart });
  else if (left != null && left <= 3 && left > 0)
    urgency = left === 1 ? t("נשאר מקום אחד") : t("נשארו {n} מקומות", { n: left });

  return (
    <div className="olc" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen?.(); }}>
      <span className="olc-glow" aria-hidden="true" />

      <div className="olc-head">
        <div className="olc-head-text">
          <span className="olc-name" dir="auto" style={{ unicodeBidi: "isolate" }}>
            {league.name}
          </span>
          <span className="olc-by">
            {league.creator_name && (
              <>
                <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                  {t("נפתחה ע״י {name}", { name: league.creator_name })}
                </span>
                {" · "}
              </>
            )}
            <span className="olc-ntrp" dir="ltr">
              NTRP {min.toFixed(1)}–{max.toFixed(1)}
            </span>
          </span>
        </div>
        {inRange && (
          <span className="olc-tag">
            <CheckIcon aria-hidden="true" />
            {t("הרמה שלך")}
          </span>
        )}
      </div>

      <div className="olc-meta">
        <span className="olc-meta-line">
          <CalendarIcon aria-hidden="true" />
          <span>{whenParts.join(" · ")}</span>
        </span>
        {league.location_name && (
          <span className="olc-meta-line">
            <PinIcon aria-hidden="true" />
            <span dir="auto" style={{ unicodeBidi: "isolate" }}>
              {league.location_name}
            </span>
          </span>
        )}
      </div>

      {/* Only a league that has been given a size can say how full it is.
          Inventing one would be inventing a rule nobody set. */}
      {capacity != null && (
        <div className="olc-spots">
          <span className="olc-bar" aria-hidden="true">
            {Array.from({ length: capacity }).map((_, i) => (
              <span key={i} className={`olc-seg${i < taken ? " is-on" : ""}`} />
            ))}
          </span>
          <span className="olc-spots-text">
            <span dir="ltr">{taken}/{capacity}</span> {t("נרשמו")} ·{" "}
            {left === 1 ? t("נשאר מקום אחד") : t("נשארו {n} מקומות", { n: left })}
          </span>
        </div>
      )}

      <div className="olc-foot">
        {urgency ? (
          <span className="olc-urgent">
            <span className="olc-urgent-dot" aria-hidden="true" />
            {urgency}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="olc-join"
          disabled={busy || joined}
          onClick={(e) => {
            // The card itself opens the preview; the button must not do both.
            e.stopPropagation();
            onJoin?.();
          }}
        >
          {joined ? t("הצטרפת") : busy ? t("מצטרף…") : t("הצטרף")}
        </button>
      </div>
    </div>
  );
}
