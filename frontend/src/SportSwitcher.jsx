import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

// Kept in step with .sportmenu in index.css: the width is needed here to
// keep the menu on the screen, and there to draw it.
const SPORTMENU_WIDTH = 320;
const SPORTMENU_MARGIN = 12;

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
  const buttonRef = useRef(null);
  // Where the menu hangs. Measured from the button each time it opens: it
  // drops from the button it belongs to, so the screen never has to be
  // re-read from the bottom up to find out what was tapped.
  const [anchor, setAnchor] = useState(null);
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

  // The button is in a sticky header, so the measurement is good for as long
  // as the menu is open; a scroll or a resize closes it rather than letting
  // it drift away from its button.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      const rtl = document.documentElement.dir === "rtl";
      // Hung from the button's own edge, then pulled back inside the screen:
      // the button sits in the middle of the header, so a menu left exactly
      // under it ran 216px off the side — measured at 390px wide.
      const width = Math.min(SPORTMENU_WIDTH, window.innerWidth - SPORTMENU_MARGIN * 2);
      const raw = rtl ? window.innerWidth - r.right : r.left;
      const start = Math.min(
        Math.max(raw, SPORTMENU_MARGIN),
        window.innerWidth - width - SPORTMENU_MARGIN,
      );
      setAnchor({ top: Math.round(r.bottom + 8), start: Math.round(start) });
    };
    place();
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

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

  // Two sports, always both, in this order. The app has rows in its sports
  // table for football, basketball, volleyball and chess, and the menu used
  // to show whichever the player had a league in, with the rest behind
  // "add a sport" — which offered five sports nothing in the app can
  // actually play yet. Tennis and padel are what Rally is, so they are what
  // the menu holds; a sport the player somehow sits in that is neither is
  // still listed, because hiding the sport someone is looking at would
  // leave them no way back to it.
  const SHOWN_SLUGS = ["tennis", "padel"];
  const order = (sport) => {
    const i = SHOWN_SLUGS.indexOf(sportSlug(sport));
    return i === -1 ? SHOWN_SLUGS.length : i;
  };
  const shown = sports
    .filter((s) => SHOWN_SLUGS.includes(sportSlug(s)) || s.id === selectedSportId)
    .sort((a, b) => order(a) - order(b));

  function choose(id) {
    setSelectedSportId(id);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="sportsw"
        ref={buttonRef}
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        <SportIcon
          sport={selectedSport}
          className="sportsw-icon"
          aria-hidden="true"
        />
        {/* 195a: the sport's name stays Hebrew here even in the English UI.
            It is one word beside a Hebrew wordmark, and the sheet it opens
            names every sport in the reader's language anyway. */}
        <span className="sportsw-name">{selectedSport.name}</span>
        <ChevronDownIcon
          className={`sportsw-chev${open ? " is-open" : ""}`}
          aria-hidden="true"
        />
      </button>

      {/* Still portalled to <body>, not rendered next to the button: the
          topbar carries a backdrop-filter, and a filtered element becomes the
          containing block for its fixed-position descendants, so a menu left
          in place was laid out inside a 56px bar with its second row off the
          screen. It is positioned under the button by hand instead. */}
      {open &&
        anchor &&
        createPortal(
          <div className="sportmenu-overlay" onClick={() => setOpen(false)}>
            <div
              className="sportmenu"
              role="dialog"
              aria-modal="true"
              aria-label={t("באיזה ענף?")}
              style={{ top: anchor.top, insetInlineStart: anchor.start }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="sportmenu-title">{t("באיזה ענף?")}</h2>

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

            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
