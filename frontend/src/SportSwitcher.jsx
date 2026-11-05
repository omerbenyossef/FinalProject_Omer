import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { useSport } from "./SportContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import {
  BasketballIcon,
  ChessIcon,
  ChevronDownIcon,
  FootballIcon,
  PadelIcon,
  TennisIcon,
  VolleyballIcon,
} from "./Icons.jsx";
import { matchScheduleState } from "./matchUtils.js";
import { sportSlug } from "./sportTheme.js";

/* 187c/187d — which sport you are looking at.
   It used to be a grey mono label beside the wordmark with an invisible
   <select> over it: no affordance, so nobody found it, and padel existed
   without ever appearing on screen. Now it is a button in the sport's own
   colour, and it opens a sheet that says what is waiting for you in each
   sport before you switch to it. */

const ICONS = {
  tennis: TennisIcon,
  padel: PadelIcon,
  football: FootballIcon,
  basketball: BasketballIcon,
  volleyball: VolleyballIcon,
  chess: ChessIcon,
};

export function SportIcon({ sport, ...rest }) {
  const Icon = ICONS[sportSlug(sport)] || TennisIcon;
  return <Icon {...rest} />;
}

// The one thing worth saying about a sport on a row that has one line for it:
// whatever is waiting for the player there. Ordered by how much it is their
// move — a result to confirm outranks a time nobody has proposed yet.
function urgentLine(entries, userId, t) {
  const ranked = [];
  for (const entry of entries) {
    const m = entry.match;
    const leagueName = entry.league_name || t("ידידותי");
    if (m.status === "pending_confirmation" && m.reported_by !== userId) {
      ranked.push({
        sort: 0,
        text: t("יש תוצאה לאישור ב{league}", { league: leagueName }),
      });
      continue;
    }
    if (m.status !== "pending") continue;
    const state = matchScheduleState(m, userId);
    if (state === "proposed_by_them")
      ranked.push({
        sort: 1,
        text: t("צריך לאשר שעה ב{league}", { league: leagueName }),
      });
    else if (state === "ready")
      ranked.push({
        sort: 2,
        text: t("צריך לדווח תוצאה ב{league}", { league: leagueName }),
      });
    else if (state === "unscheduled")
      ranked.push({
        sort: 3,
        text: t("צריך לקבוע שעה ב{league}", { league: leagueName }),
      });
  }
  ranked.sort((a, b) => a.sort - b.sort);
  return ranked[0]?.text ?? null;
}

export default function SportSwitcher({ userId }) {
  const { sports, selectedSportId, setSelectedSportId, selectedSport } =
    useSport();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Fetched when the sheet is first opened, not on every page: the counts are
  // only ever read inside it.
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!open || summary) return;
    let alive = true;
    // A pairs sport is asked about its pairs too: "you haven't joined yet" is
    // true there and useless, because joining is not what is blocking you —
    // finding a partner is. One call per pairs sport, which today is padel.
    const pairSports = sports.filter((sport) => sport.plays_in_pairs);
    Promise.all([
      api.myLeagues(),
      api.myNextMatches(),
      ...pairSports.map((sport) =>
        api
          .myPairs(sport.id)
          .then((pairs) => [sport.id, pairs])
          .catch(() => [sport.id, []]),
      ),
    ])
      .then(([leagues, entries, ...pairLists]) => {
        if (alive)
          setSummary({ leagues, entries, pairsBySport: Object.fromEntries(pairLists) });
      })
      .catch(() => {
        // The sheet's job is switching sport; the status lines are a bonus.
        if (alive) setSummary({ leagues: [], entries: [], pairsBySport: {} });
      });
    return () => {
      alive = false;
    };
  }, [open, summary, sports]);

  // Escape closes it, like any other layer over the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!sports.length || !selectedSport) return null;

  const leagueCountFor = (sportId) =>
    (summary?.leagues || []).filter((l) => l.sport?.id === sportId).length;
  const entriesFor = (sportId) =>
    (summary?.entries || []).filter((e) => e.sport_id === sportId);

  // What to say about a sport the player has no league in. In a pairs sport
  // the honest answer is never "you haven't joined": you cannot join one
  // without a partner, so the sheet names the step actually in front of them.
  function nothingYetLine(sport) {
    if (!summary) return null;
    if (!sport.plays_in_pairs) return t("עוד לא הצטרפת");
    const pairs = summary.pairsBySport?.[sport.id] || [];
    if (pairs.some((p) => p.status === "active")) return t("יש צמד · עוד לא בליגה");
    if (pairs.some((p) => p.status === "pending" && !p.proposed_by_me))
      return t("מחכה לך הזמנה לצמד");
    return t("צריך פרטנר כדי להתחיל");
  }

  // The sports the player actually plays lead; the rest are behind
  // "להוסיף ענף", so a six-sport list doesn't bury the two that matter.
  const played = sports.filter(
    (s) => s.id === selectedSportId || leagueCountFor(s.id) > 0,
  );
  const rest = sports.filter((s) => !played.includes(s));
  const shown = showAll ? [...played, ...rest] : played;

  function choose(id) {
    setSelectedSportId(id);
    setOpen(false);
    setShowAll(false);
  }

  return (
    <>
      <button
        type="button"
        className="sportsw"
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        <SportIcon
          sport={selectedSport}
          className="sportsw-icon"
          aria-hidden="true"
        />
        {/* 195a kept this Hebrew in both languages; 196b changes that one
            thing: the label follows the UI language, like every other word
            on the screen. */}
        <span className="sportsw-name">{t(selectedSport.name)}</span>
        <ChevronDownIcon
          className={`sportsw-chev${open ? " is-open" : ""}`}
          aria-hidden="true"
        />
      </button>

      {/* The sheet goes to <body>, not next to the button. The topbar carries a
          backdrop-filter, and a filtered element becomes the containing block
          for its fixed-position descendants — so an overlay rendered in place
          was laid out inside a 56px-tall sticky bar, with everything below the
          first row off the screen and untappable. */}
      {open &&
        createPortal(
          <div
            className="sportsheet-overlay"
            onClick={() => {
              setOpen(false);
              setShowAll(false);
            }}
          >
            <div
              className="sportsheet"
              role="dialog"
              aria-modal="true"
              aria-label={t("באיזה ענף?")}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="sportsheet-grab" aria-hidden="true" />
              <h2 className="sportsheet-title">{t("באיזה ענף?")}</h2>

              {shown.map((sport) => {
                const active = sport.id === selectedSportId;
                const count = leagueCountFor(sport.id);
                const urgent = summary
                  ? urgentLine(entriesFor(sport.id), userId, t)
                  : null;
                const countLine =
                  count === 0
                    ? nothingYetLine(sport)
                    : count === 1
                      ? t("ליגה אחת")
                      : t("{n} ליגות", { n: count });
                const status = [countLine, urgent].filter(Boolean).join(" · ");
                return (
                  <button
                    type="button"
                    key={sport.id}
                    className={`sportrow${active ? " is-on" : ""}`}
                    onClick={() => choose(sport.id)}
                    aria-current={active ? "true" : undefined}
                  >
                    <span className="sportrow-badge">
                      <SportIcon sport={sport} aria-hidden="true" />
                    </span>
                    <span className="sportrow-body">
                      <span className="sportrow-name">{t(sport.name)}</span>
                      {status && (
                        <span className="sportrow-status">{status}</span>
                      )}
                    </span>
                    <span
                      className={`sportrow-check${active ? " is-on" : ""}`}
                      aria-hidden="true"
                    >
                      {active && (
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <polyline
                            points="6 12.5 10.5 17 18 8"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}

              {rest.length > 0 && !showAll && (
                <button
                  type="button"
                  className="sportsheet-more"
                  onClick={() => setShowAll(true)}
                >
                  {t("להוסיף ענף")}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
