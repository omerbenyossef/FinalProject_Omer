import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useSport } from "../SportContext.jsx";
import { usePairs } from "../PairContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useLiveData } from "../liveData.js";
import Avatar from "../Avatar.jsx";
import { tintColor, tintFor } from "../tint.js";
import { PlusIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import {
  dayMonthPadded as dayMonth,
  weekdayName,
} from "../matchUtils.js";
import OpenGames from "./OpenGames.jsx";
import Leagues from "./Leagues.jsx";

/* 205a — Play.

   It replaces the three-tile hub (189b), which answered "what kinds of game
   exist" — a question nobody arrived with. The two screens are now split by
   what the reader came to do: Home is what is happening, and this is where
   something gets done. Leagues and open games stop being pushed pages behind
   a tile and become tabs; a friendly, which is one tap and no list, becomes
   the button floating over all three.

   The first tab is the one the hub never had: every match of mine, grouped
   by when — which is how somebody looking for a match thinks of it, and was
   the thing people could not find. */

const TAB_KEY = "rally-play-tab";
const TABS = ["matches", "open", "leagues"];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// What the row offers on the right, and what the line under the name says.
// One place, so a match cannot be "waiting for you" in the group heading and
// "all set" on its own row.
const NEEDS_ME = new Set(["played", "confirm_mine", "time_from_them"]);

export default function Play() {
  const { selectedSportId } = useSport();
  const { selectedPair, pairLensReady } = usePairs();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [matches, setMatches] = useState(null);
  const [gameCount, setGameCount] = useState(null);
  const [leagueCount, setLeagueCount] = useState(null);

  // The tab the reader last chose, because this screen is somewhere they come
  // back to. A link from Home names its own tab and wins over the memory.
  const [tab, setTab] = useState(() => {
    const asked = params.get("tab");
    if (TABS.includes(asked)) return asked;
    const remembered = localStorage.getItem(TAB_KEY);
    return TABS.includes(remembered) ? remembered : "matches";
  });

  function choose(next) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // A browser that refuses storage still gets a working screen.
    }
    // The tab is in the URL so going back lands where it was left, and so a
    // link into one tab can be shared.
    const copy = new URLSearchParams(params);
    copy.set("tab", next);
    setParams(copy, { replace: true });
  }

  const load = useCallback(() => {
    if (!selectedSportId || !pairLensReady) return;
    api
      .myMatches(selectedSportId, selectedPair?.id)
      .then(setMatches)
      .catch(() => setMatches([]));
    api
      .openGames(selectedSportId)
      .then((games) => setGameCount(games.filter((g) => !g.blocked_reason).length))
      .catch(() => setGameCount(0));
    api
      .myLeagues(selectedPair?.id)
      .then((leagues) => setLeagueCount(leagues.filter((l) => l.sport?.id === selectedSportId).length))
      .catch(() => setLeagueCount(0));
  }, [selectedSportId, selectedPair?.id, pairLensReady]);

  useEffect(load, [load]);
  // Somebody else reporting a result is this screen's business too.
  useLiveData(load);

  // How many days away a date is, which can be negative. calendarDaysUntil
  // clamps at zero — it is written for countdowns — and a match from August
  // came back as "0 days away", which is how three closed rounds all ended up
  // under a heading that said "Today".
  const todayKey = startOfDay(new Date()).getTime();
  const dayOffset = (date) => Math.round((startOfDay(date).getTime() - todayKey) / 86400000);

  const rows = matches ?? [];
  const needsYou = rows.filter((m) => NEEDS_ME.has(m.state));
  const rest = rows.filter((m) => !NEEDS_ME.has(m.state));
  // A match whose time has gone by is not something to plan around, and a
  // list of upcoming matches that opens with August is not a list of
  // upcoming matches. They are still real — a voided one has to be moved to
  // another round by somebody — so they go to the bottom under their own
  // heading rather than away.
  const isPast = (m) =>
    m.state === "not_played" || (m.scheduled_at && dayOffset(new Date(m.scheduled_at)) < 0);
  const past = rest
    .filter(isPast)
    .sort((a, b) => new Date(b.scheduled_at ?? 0) - new Date(a.scheduled_at ?? 0));
  const live = rest.filter((m) => !isPast(m));
  const scheduled = live.filter((m) => m.scheduled_at);
  const undated = live.filter((m) => !m.scheduled_at);

  // The sub-line under the title: the first of these that is true, so the
  // screen opens by naming the thing that is actually owed.
  const subline = (() => {
    if (matches == null) return "";
    const toScore = rows.filter((m) => m.state === "played" || m.state === "confirm_mine").length;
    if (toScore)
      return toScore === 1
        ? t("משחק אחד מחכה לתוצאה")
        : t("{n} משחקים מחכים לתוצאה", { n: toScore });
    const toSchedule = rows.filter(
      (m) => m.state === "no_time" || m.state === "time_from_them"
    ).length;
    if (toSchedule)
      return toSchedule === 1
        ? t("משחק אחד מחכה לתיאום")
        : t("{n} משחקים מחכים לתיאום", { n: toSchedule });
    const next = scheduled[0];
    if (next) {
      const at = new Date(next.scheduled_at);
      return t("הבא: {day} {time} מול {name}", {
        day:
          dayOffset(at) === 0
            ? t("היום")
            : dayOffset(at) === 1
              ? t("מחר")
              : weekdayName(at, t),
        time: hhmm(at),
        name: next.opponent_name,
      });
    }
    return t("עוד לא נקבע כלום. אפשר להצטרף לאירוע למטה");
  })();

  // Scheduled matches, in day-sized groups: today, tomorrow, then each day by
  // its own name. A list of twelve rows with dates in them is a spreadsheet;
  // the day is the heading people actually scan for.
  const dayGroups = (() => {
    const byDay = new Map();
    for (const match of scheduled) {
      const at = new Date(match.scheduled_at);
      const key = startOfDay(at).getTime();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(match);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([key, items]) => {
        const day = new Date(key);
        const away = dayOffset(day);
        return {
          key: `d${key}`,
          title: away === 0 ? t("היום") : away === 1 ? t("מחר") : weekdayName(day, t),
          // The weekday alone is ambiguous past this week — "Sunday" could be
          // in four days or in eleven — so the date rides along beside it.
          sub: away <= 1 ? `${weekdayName(day, t)} ${dayMonth(day)}` : dayMonth(day),
          items,
        };
      });
  })();

  function contextLine(match) {
    const at = match.scheduled_at ? new Date(match.scheduled_at) : null;
    if (match.state === "played" || match.state === "confirm_mine") {
      const played = at ? `${t("שוחק")} ${weekdayName(at, t)}` : t("שוחק");
      return `${played} · ${t("מחכה לתוצאה")}`;
    }
    // A row at the bottom of the screen is months old, and the time of day it
    // was meant to be played at says nothing — the date does, and so does
    // whatever was agreed about why it never happened.
    if (at && isPast(match))
      return [
        `${weekdayName(at, t)} ${dayMonth(at)}`,
        match.note ? t(match.note) : match.place,
      ]
        .filter(Boolean)
        .join(" · ");
    if (at) return [hhmm(at), match.place].filter(Boolean).join(" · ");
    const parts = [];
    if (match.round) parts.push(t("מחזור {n}", { n: match.round }));
    if (match.round_ends_at)
      parts.push(t("נסגר {day}", { day: weekdayName(new Date(match.round_ends_at), t) }));
    if (!parts.length) parts.push(match.league_name || t("ידידותי"));
    return parts.join(" · ");
  }

  function side(match) {
    if (match.state === "played")
      return { kind: "go", label: t("דווח תוצאה"), to: `/matches/${match.id}` };
    if (match.state === "confirm_mine")
      return { kind: "go", label: t("אשר תוצאה"), to: `/matches/${match.id}/confirm` };
    // A proposed time that has already gone by cannot be confirmed — the
    // server refuses a past time — so the row must not keep offering it.
    // What is left to do is agree a new one.
    const stale =
      (match.state === "time_from_them" || match.state === "time_from_me") &&
      match.scheduled_at &&
      new Date(match.scheduled_at).getTime() < Date.now();
    if (stale) return { kind: "outline", label: t("קבעו זמן"), to: `/matches/${match.id}` };
    if (match.state === "time_from_them")
      return { kind: "go", label: t("אשר את השעה"), to: `/matches/${match.id}` };
    if (match.state === "no_time")
      return { kind: "outline", label: t("קבעו זמן"), to: `/matches/${match.id}` };
    if (match.state === "not_played")
      return { kind: "outline", label: t("תיאום במחזור אחר"), to: `/matches/${match.id}/reschedule` };
    if (match.state === "waiting_on_them" || match.state === "time_from_me")
      return { kind: "quiet", label: t("מחכה ל{name}", { name: match.opponent_name }) };
    return { kind: "ok", label: t("מאושר") };
  }

  function matchRow(match) {
    const action = side(match);
    return (
      <button
        type="button"
        className="pl-row"
        key={`m${match.id}`}
        onClick={() => navigate(`/matches/${match.id}`)}
        style={{ "--tint": tintFor(match.opponent_name) }}
      >
        <Avatar
          name={match.opponent_name}
          photoUrl={match.opponent_photo_url}
          size={40}
          background={tintColor(match.opponent_name)}
          color="#0e1116"
          fontFamily="var(--display)"
          fontSize={18}
        />
        <span className="pl-row-text">
          <span className="pl-row-name">
            {`${t("מול")} `}
            <bdi>{match.opponent_name}</bdi>
          </span>
          <span className="pl-row-ctx" dir="auto">
            {contextLine(match)}
          </span>
        </span>
        {action.kind === "go" || action.kind === "outline" ? (
          <span
            className={action.kind === "go" ? "pl-go" : "pl-outline"}
            onClick={(e) => {
              e.stopPropagation();
              navigate(action.to);
            }}
          >
            {action.label}
          </span>
        ) : (
          <span className={`pl-chip${action.kind === "ok" ? " is-ok" : ""}`}>
            {action.kind === "ok" && (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <polyline
                  points="5 12.5 10 17.5 19 7"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {action.label}
          </span>
        )}
      </button>
    );
  }

  function group(title, sub, items, key) {
    if (!items.length) return null;
    return (
      <section className="pl-group" key={key}>
        <div className="pl-group-head">
          <h2 className="pl-group-title">{title}</h2>
          {sub && (
            <span className="pl-group-sub" dir="ltr">
              {sub}
            </span>
          )}
        </div>
        <div className="pl-card">{items.map(matchRow)}</div>
      </section>
    );
  }

  const tabs = [
    { key: "matches", label: t("המשחקים שלי"), count: rows.length },
    { key: "open", label: t("אירועים"), count: gameCount },
    { key: "leagues", label: t("ליגות"), count: leagueCount },
  ];

  return (
    <div className="pl">
      <header className="pl-head">
        <h1 className="pl-title">{t("בוא נשחק")} 🎾</h1>
        <p className="pl-sub" dir="auto">
          {subline}
        </p>
      </header>

      <div className="pl-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            type="button"
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            className={`pl-tab${tab === item.key ? " is-on" : ""}`}
            onClick={() => choose(item.key)}
          >
            <span className="pl-tab-label">{item.label}</span>
            <span className="pl-tab-count" dir="ltr">
              {item.count == null ? "" : item.count}
            </span>
          </button>
        ))}
      </div>

      {tab === "matches" && (
        <div className="pl-matches">
          {matches == null ? (
            <SkeletonBar />
          ) : rows.length === 0 ? (
            <div className="pl-empty">
              <p className="pl-empty-text">{t("אין לך משחקים פתוחים")}</p>
              <Link to="/games?tab=open" className="btn-secondary btn-small">
                {t("אירועים לידך")}
              </Link>
            </div>
          ) : (
            <>
              {group(t("מחכה לך"), null, needsYou, "needs")}
              {dayGroups.map((g) => group(g.title, g.sub, g.items, g.key))}
              {group(t("בלי תאריך"), null, undated, "undated")}
              {group(t("עבר הזמן"), null, past, "past")}
            </>
          )}
        </div>
      )}

      {/* The two lists are the screens that already existed, with their own
          top bars off: here they are tabs, not pages somebody pushed. */}
      {tab === "open" && <OpenGames embedded />}
      {tab === "leagues" && <Leagues embedded />}

      {/* A friendly is one tap and no list, so it is not a tab — it is the
          button over all three of them. */}
      <button type="button" className="pl-fab" onClick={() => navigate("/friendly/new")}>
        <PlusIcon aria-hidden="true" />
        {t("משחק ידידותי")}
      </button>
    </div>
  );
}
