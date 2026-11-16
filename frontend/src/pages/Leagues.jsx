import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import EmptyState from "../EmptyState.jsx";
import { TrophyIcon, ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import {
  NTRP_STEPS,
  calendarDaysUntil,
  currentRoundNumber,
  monthName,
  roundDueDateObj,
  weekdayName,
} from "../matchUtils.js";
import { SportIcon } from "../SportSwitcher.jsx";
import { usePairs } from "../PairContext.jsx";
import RatingQuestionnaire from "../RatingQuestionnaire.jsx";

// "3RD" reads as a placing in English. Hebrew has no ordinal suffix, so it
// says the word instead of gluing a letter to a digit.
function rankLabel(rank, language, t) {
  if (language !== "en") return t("מקום {n}", { n: rank });
  const teens = rank % 100;
  const suffix =
    teens >= 11 && teens <= 13 ? "th" : ["th", "st", "nd", "rd"][rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

function RowSkeletons({ rows = 2 }) {
  return (
    <div className="lg-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="lg-row" key={i}>
          <span className="lg-row-body">
            <SkeletonBar width="58%" height={17} />
            <SkeletonBar width="76%" height={11} style={{ marginTop: 7 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// Courts here are booked by the hour, so the format is chosen by slot
// length rather than an abstract set count — an hour fits roughly a
// best-of-3, two hours roughly a best-of-5.
const FORMAT_OPTIONS = [
  [3, "שעה"],
  [5, "שעתיים"],
];
const ROUND_LEN_OPTIONS = [
  [7, "שבועי"],
  [14, "כל שבועיים"],
];
const OPEN_OPTIONS = [
  [false, "בהזמנה בלבד"],
  [true, "פתוחה לכולם"],
];
// Local calendar day, not toISOString — that shifts to UTC and can land on the
// day before.
// The shared weekday and month labels are stored in capitals, because other
// screens print them in mono where capitals are the typeface's own voice.
// Here they are words in a sentence, and "ends SATURDAY" reads as an alarm.
// Hebrew has no letter case, so lowercasing is a no-op there.
function sentenceCase(label) {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

function shortDate(date, t) {
  return `${date.getDate()} ${sentenceCase(monthName(date, t))}`;
}

// A weekday only tells you which day when it is inside the coming week. Past
// that it is ambiguous — "Sat" could be in two days or in sixteen — so the
// date says it instead.
function dayLabel(date, t) {
  return calendarDaysUntil(date) > 7 ? shortDate(date, t) : sentenceCase(weekdayName(date, t));
}

function isoDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Spelled out in the reader's own language, so nothing rests on whether the
// date field shows dd/mm or mm/dd.
function longDate(value, language) {
  return new Date(value).toLocaleDateString(language === "en" ? "en-GB" : "he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// A league opens whenever its creator wants. The next Sunday is only the
// default, because a round that starts on one runs a whole week.
function nextSunday(from = new Date()) {
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  day.setDate(day.getDate() + ((7 - day.getDay()) % 7));
  return day;
}

export default function Leagues({ embedded = false }) {
  const [leagues, setLeagues] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [myLevel, setMyLevel] = useState(null);
  // 216 — the same server-computed match states the home screen reads, so
  // "needs you" here and the next step there can never disagree.
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSheet, setShowSheet] = useState(false);
  const [name, setName] = useState("");
  const [bestOf, setBestOf] = useState(3);
  const [roundLen, setRoundLen] = useState(7);
  const [isOpen, setIsOpen] = useState(false);
  const [levelMin, setLevelMin] = useState(1.5);
  const [levelMax, setLevelMax] = useState(5.5);
  const [startsAt, setStartsAt] = useState(() => isoDay(nextSunday()));
  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [showRatingGate, setShowRatingGate] = useState(false);
  const [activeTab, setActiveTab] = useState("mine");
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sports, selectedSportId } = useSport();
  const { t, language } = useLanguage();
  const { activePairs, selectedPair, pairLensReady } = usePairs();
  const [joiningId, setJoiningId] = useState(null);
  const [joinedIds, setJoinedIds] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoOpenedRef = useRef(false);

  async function loadData() {
    setLoading(true);
    try {
      const leaguesData = await api.listLeagues();
      setLeagues(leaguesData);

      if (user) {
        const mine = await api.myLeagues(selectedPair?.id);
        setMyLeagues(mine);
        api
          .myMatches(selectedSportId, selectedPair?.id)
          .then(setMatches)
          .catch(() => setMatches([]));
      } else {
        setMyLeagues([]);
        setMatches([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!pairLensReady) return;
    loadData();
    // Switching pair changes which leagues are mine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedPair?.id, pairLensReady]);

  useEffect(() => {
    if (!user) {
      setMyLevel(null);
      return;
    }
    api
      .myRatings()
      .then((ratings) => setMyLevel(ratings.find((r) => r.sport_id === selectedSportId)?.level ?? null))
      .catch(() => {});
  }, [user, selectedSportId]);

  useEffect(() => {
    if (showSheet) inputRef.current?.focus();
  }, [showSheet]);

  // 109a's "start your own league" action links here with ?create=1 so the
  // creation sheet opens directly instead of just landing on this page.
  useEffect(() => {
    if (autoOpenedRef.current || !user || searchParams.get("create") !== "1") return;
    autoOpenedRef.current = true;
    requestCreate();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("create");
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, searchParams]);

  function openSheet() {
    setName("");
    setBestOf(3);
    setRoundLen(7);
    setIsOpen(false);
    setLevelMin(1.5);
    setLevelMax(5.5);
    setStartsAt(isoDay(nextSunday()));
    setSheetError("");
    setShowSheet(true);
  }

  function closeSheet() {
    setShowSheet(false);
  }

  async function requestCreate() {
    try {
      const ratings = await api.myRatings();
      if (ratings.some((r) => r.sport_id === selectedSportId)) {
        openSheet();
      } else {
        setShowRatingGate(true);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function handleRatingGateDone() {
    setShowRatingGate(false);
    openSheet();
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSheetError("");
    setSubmitting(true);
    try {
      const league = await api.createLeague({
        name: name.trim(),
        description: "",
        sport_id: selectedSportId,
        is_open: isOpen,
        best_of: bestOf,
        round_length_days: roundLen,
        // A private league is joined by personal invite, not by matching a
        // level range, so the range picker is hidden for it — send the full
        // range rather than whatever was left over from a prior open toggle.
        level_min: isOpen ? levelMin : NTRP_STEPS[0],
        level_max: isOpen ? levelMax : NTRP_STEPS[NTRP_STEPS.length - 1],
        // Location and capacity were optional fields nobody filled in on the
        // way in. They live in league settings now, which is also where the
        // coordinates are taken (with a location to justify the permission
        // prompt) — asking for the device's location to create a league held
        // the button hostage to a prompt for a field that isn't here.
        capacity: null,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        location_name: null,
        lat: null,
        lng: null,
      });
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      setSheetError(err.message);
      setSubmitting(false);
    }
  }

  /* 193a — joining straight from the card. The gates are the preview
     screen's, because they are the league's: a doubles league needs a pair
     first, and a player with no rating has to answer the questionnaire. That
     questionnaire is a screen of its own, so the card hands over to the
     preview rather than trying to host it in a list. */
  async function joinFromCard(league) {
    if (league.is_doubles && activePairs.length === 0) {
      navigate("/partners");
      return;
    }
    setJoiningId(league.id);
    setError("");
    try {
      const check = await api.checkRating(league.id);
      if (!check.has_rating) {
        navigate(`/leagues/${league.id}/preview`);
        return;
      }
      await api.joinLeague(league.id, undefined, league.is_doubles ? activePairs[0].id : null);
      // Optimistic: the card says "joined" at once, and the reload moves it to
      // the שלי tab where it now belongs.
      setJoinedIds((prev) => [...prev, league.id]);
      await loadData();
      setActiveTab("mine");
    } catch (err) {
      setError(err.message);
    } finally {
      setJoiningId(null);
    }
  }

  const bySelectedSport = (l) => l.sport.id === selectedSportId;
  const inPairsSport = Boolean(sports.find((s) => s.id === selectedSportId)?.plays_in_pairs);
  const myLeagueIds = new Set(myLeagues.map((l) => l.id));
  // Whether this league's range would admit this player. It used to decide
  // whether to list the league at all, on the grounds that offering a join
  // that could only come back refused was worse than silence. The preview says
  // why instead of refusing now, so the league is listed and marked: somebody
  // looking for a league wants to know what there is, including what they are
  // not ready for yet.
  // Whose level that is. In a sport played in pairs the entrant is the pair,
  // not the person: a 3.0 plays in a 4.0 league beside a 5.0 because together
  // they are a 4.0 team, and the join endpoint has always measured the range
  // against the pair. This screen measured it against one member's personal
  // number, so a pair at 3.0 that a 2.5–3.5 league would admit without a
  // murmur was filed under "outside my range".
  //
  // A pair with no level yet makes no claim either way: what is in the way
  // then is the questionnaire, and the preview says so in those words.
  const entrantLevel = inPairsSport ? (selectedPair?.level ?? null) : myLevel;
  const takesMe = (l) =>
    entrantLevel == null ||
    ((l.level_min ?? 1.5) <= entrantLevel && entrantLevel <= (l.level_max ?? 7.0));
  const openLeagues = leagues.filter(
    (l) => l.is_open && bySelectedSport(l) && !myLeagueIds.has(l.id)
  );
  // A league with no room left is not an offer (193a). One that was never
  // given a size has no "full" to be.
  const hasRoom = (l) => l.capacity == null || (l.member_count ?? 0) < l.capacity;
  // Soonest first, and a league with no start date after the ones that have
  // one — "when does it begin" is the question the list is sorted by.
  const bySoonest = (a, b) => {
    const ta = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
    const tb = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
    return ta - tb;
  };
  const openForMe = openLeagues.filter((l) => takesMe(l) && hasRoom(l)).sort(bySoonest);
  const myLeaguesForSport = myLeagues.filter(bySelectedSport);


  const selectedSport = sports.find((s) => s.id === selectedSportId);
  // A season nobody has declared over: the round count has simply run past the
  // planned number of them.
  const isDone = (l) => {
    const round = currentRoundNumber(l.schedule_started_at, l.round_length_days || 7);
    return l.planned_rounds != null && round != null && round > l.planned_rounds;
  };
  const mineLive = myLeaguesForSport.filter((l) => !isDone(l));
  const mineDone = myLeaguesForSport.filter(isDone);

  const TABS = [
    { key: "mine", label: t("שלי"), count: mineLive.length },
    { key: "open", label: t("פתוחות"), count: openForMe.length },
    { key: "done", label: t("הסתיימו"), count: mineDone.length },
  ];

  // 216 — the one thing this league is asking of me, in the same order the
  // home screen asks it. Built from the same server-computed states, so the
  // two screens cannot disagree about what is owed.
  const needs = (() => {
    const inSport = (m) => m.league_name;
    const played = matches.find((m) => inSport(m) && m.state === "played");
    if (played)
      return {
        title: t("דווח את התוצאה"),
        match: played,
        action: t("דווח תוצאה"),
        to: `/matches/${played.id}`,
      };
    const confirm = matches.find((m) => inSport(m) && m.state === "confirm_mine");
    if (confirm)
      return {
        title: t("אשר את התוצאה"),
        match: confirm,
        action: t("אשר תוצאה"),
        to: `/matches/${confirm.id}/confirm`,
      };
    const proposed = matches.find((m) => inSport(m) && m.state === "time_from_them");
    if (proposed)
      return {
        title: t("{name} הציע/ה שעה", { name: proposed.opponent_name }),
        match: proposed,
        action: t("הגב"),
        to: `/matches/${proposed.id}`,
      };
    const open = matches
      .filter(
        (m) =>
          inSport(m) &&
          m.state === "no_time" &&
          (!m.round_starts_at || new Date(m.round_starts_at).getTime() <= Date.now()) &&
          (!m.round_ends_at || new Date(m.round_ends_at).getTime() > Date.now())
      )
      .sort(
        (a, b) =>
          new Date(a.round_ends_at ?? 8640000000000000) -
          new Date(b.round_ends_at ?? 8640000000000000)
      )[0];
    if (open)
      return {
        title: open.round ? t("תאמו את מחזור {n}", { n: open.round }) : t("קבעו זמן למשחק"),
        match: open,
        action: t("קבעו זמן"),
        to: `/matches/${open.id}`,
      };
    return null;
  })();

  const toSchedule = matches.filter(
    (m) =>
      m.league_name &&
      m.state === "no_time" &&
      (!m.round_ends_at || new Date(m.round_ends_at).getTime() > Date.now()) &&
      (!m.round_starts_at || new Date(m.round_starts_at).getTime() <= Date.now())
  ).length;

  // Leagues that are asking for something come first; after that, whichever
  // round closes soonest, because that is the one about to be lost.
  const needyLeagueIds = new Set(
    matches
      .filter((m) => m.league_name && ["played", "confirm_mine", "time_from_them", "no_time"].includes(m.state))
      .map((m) => m.league_name)
  );
  const mineSorted = [...mineLive].sort((a, b) => {
    const needA = needyLeagueIds.has(a.name) ? 0 : 1;
    const needB = needyLeagueIds.has(b.name) ? 0 : 1;
    if (needA !== needB) return needA - needB;
    const endA = roundDueDateObj(
      a.schedule_started_at,
      currentRoundNumber(a.schedule_started_at, a.round_length_days || 7),
      a.round_length_days || 7
    );
    const endB = roundDueDateObj(
      b.schedule_started_at,
      currentRoundNumber(b.schedule_started_at, b.round_length_days || 7),
      b.round_length_days || 7
    );
    return new Date(endA ?? 8640000000000000) - new Date(endB ?? 8640000000000000);
  });

  const subline = (() => {
    if (loading) return "";
    if (activeTab === "open")
      return openForMe.length === 0
        ? t("אין ליגות פתוחות ברמה שלך")
        : openForMe.length === 1
          ? t("ליגה אחת פתוחה ברמה שלך")
          : t("{n} ליגות פתוחות ברמה שלך", { n: openForMe.length });
    if (activeTab === "done")
      return mineDone.length === 1
        ? t("ליגה אחת שהסתיימה")
        : t("{n} ליגות שהסתיימו", { n: mineDone.length });
    if (toSchedule)
      return toSchedule === 1 ? t("משחק אחד לתאם") : t("{n} משחקים לתאם", { n: toSchedule });
    return mineLive.length === 1 ? t("ליגה אחת") : t("{n} ליגות", { n: mineLive.length });
  })();

  // "4 מתוך 6" in Hebrew, "4th of 6" in English: Hebrew has no ordinal
  // suffix to glue to a digit.
  function placeOf(place, total) {
    if (place == null) return null;
    return (
      <span className="lg2-place" dir={language === "en" ? "ltr" : "auto"}>
        <b>{language === "en" ? rankLabel(place, language, t) : place}</b>
        {` ${t("מתוך")} ${total}`}
      </span>
    );
  }

  function mineRow(league) {
    const round = currentRoundNumber(league.schedule_started_at, league.round_length_days || 7);
    const total = league.planned_rounds ?? null;
    const endsAt = roundDueDateObj(league.schedule_started_at, round, league.round_length_days || 7);
    const players = league.my_members_total ?? league.member_count ?? 0;
    const started = Boolean(league.schedule_started_at);
    const missing = league.capacity ? league.capacity - players : null;

    const status = !started
      ? missing && missing > 0
        ? missing === 1
          ? t("ממתינים לשחקן אחד נוסף")
          : t("ממתינים לעוד {n} שחקנים", { n: missing })
        : t("עוד לא התחילה")
      : [
          total
            ? t("מחזור {n} מתוך {total}", { n: round, total })
            : t("מחזור {n}", { n: round }),
          endsAt ? t("נסגר {day}", { day: dayLabel(new Date(endsAt), t) }) : null,
        ]
          .filter(Boolean)
          .join(" · ");

    return (
      <Link to={`/leagues/${league.id}`} className="lg2-row" key={league.id}>
        <span className="lg2-row-text">
          <span className="lg2-row-name" dir="auto">
            {league.name}
          </span>
          <span className="lg2-row-sub" dir="auto">
            {status}
          </span>
        </span>
        {started && placeOf(league.my_rank, players)}
        <ChevronIcon className="lg2-chev" aria-hidden="true" />
      </Link>
    );
  }

  function doneRow(league) {
    const players = league.my_members_total ?? league.member_count ?? 0;
    const rounds = league.planned_rounds ?? null;
    const ended = league.schedule_started_at
      ? new Date(
          new Date(league.schedule_started_at).getTime() +
            (rounds ?? 0) * (league.round_length_days || 7) * 86400000
        )
      : null;
    const status = [
      ended
        ? t("הסתיימה {date}", {
            date: ended.toLocaleDateString(language === "en" ? "en-GB" : "he-IL", {
              month: "long",
              year: "numeric",
            }),
          })
        : null,
      rounds ? t("{n} מחזורים", { n: rounds }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <Link to={`/leagues/${league.id}`} className="lg2-row" key={league.id}>
        <span className="lg2-row-text">
          <span className="lg2-row-name" dir="auto">
            {league.name}
          </span>
          <span className="lg2-row-sub" dir="auto">
            {status}
          </span>
        </span>
        {placeOf(league.my_rank, players)}
        <ChevronIcon className="lg2-chev" aria-hidden="true" />
      </Link>
    );
  }

  function openCard(league) {
    const joined = joinedIds.includes(league.id);
    const taken = (league.member_count ?? league.joined ?? 0) + (joined ? 1 : 0);
    const left = league.capacity ? Math.max(0, league.capacity - taken) : null;
    return (
      <article className="lg2-open" key={league.id}>
        <div
          className="lg2-open-top"
          onClick={() => navigate(`/leagues/${league.id}/preview`)}
          role="presentation"
        >
          <div className="lg2-open-text">
            <span className="lg2-open-name" dir="auto">
              {league.name}
            </span>
            <span className="lg2-row-sub" dir="auto">
              {[
                `NTRP ${(league.level_min ?? 1.5).toFixed(1)}–${(league.level_max ?? 7).toFixed(1)}`,
                league.starts_at
                  ? t("מתחילה {date}", {
                      date: `${sentenceCase(
                        weekdayName(new Date(league.starts_at), t)
                      )} ${shortDate(new Date(league.starts_at), t)}`,
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {league.capacity != null && (
            <span className="lg2-place" dir={language === "en" ? "ltr" : "auto"}>
              <b>{taken}</b>
              {` ${t("מתוך")} ${league.capacity}`}
            </span>
          )}
        </div>
        <div className="lg2-open-foot">
          <span className={`lg2-spots${left != null && left <= 2 ? " is-low" : ""}`}>
            {left == null
              ? t("יש מקום")
              : left === 1
                ? t("מקום אחד פנוי")
                : t("{n} מקומות פנויים", { n: left })}
          </span>
          <button
            type="button"
            className="lg2-join"
            disabled={joiningId === league.id || joined}
            onClick={() => joinFromCard(league)}
          >
            {joined ? t("הצטרפת") : t("הצטרף")}
          </button>
        </div>
      </article>
    );
  }

  const openIsEmpty = activeTab === "open" && !loading && openForMe.length === 0;

  return (
    <div className={`lgp lg2${embedded ? " lgp--embedded" : ""}`}>
      {!embedded && (
        <div className="lgp-top">
          <Link to="/games" className="lgp-back">
            <ChevronIcon aria-hidden="true" />
            {t("משחקים")}
          </Link>
          {selectedSport && (
            <span className="lgp-sport">
              <SportIcon sport={selectedSport} aria-hidden="true" />
              {t(selectedSport.name)}
            </span>
          )}
        </div>
      )}

      <header className="lg2-head">
        <h1 className="lg2-title">{t("הליגות שלי")}</h1>
        <p className="lg2-sub">{subline}</p>
      </header>

      {!user && (
        <EmptyState
          icon={<TrophyIcon aria-hidden="true" />}
          action={
            <Link to="/signin" className="btn-secondary btn-small">
              {t("כניסה")}
            </Link>
          }
        >
          {t("רוצה להקים ליגה? יש להירשם או להתחבר קודם.")}
        </EmptyState>
      )}

      {error && <p className="error">{t(error)}</p>}

      {user && (
        <>
          {/* Outlined, not filled: the row of tabs above this one is the
              screen's own, and two identical bars one under the other read
              as one control that somehow has six options. */}
          <div className="lg2-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`lg2-tab${activeTab === tab.key ? " is-on" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span>{tab.label}</span>
                <span className="lg2-tab-count" dir="ltr">
                  {loading ? "" : tab.count}
                </span>
              </button>
            ))}
          </div>

          {activeTab === "mine" &&
            (loading ? (
              <RowSkeletons />
            ) : mineLive.length === 0 ? (
              <EmptyState
                icon={<TrophyIcon aria-hidden="true" />}
                action={
                  <button type="button" className="btn-secondary btn-small" onClick={requestCreate}>
                    {t("ליגה חדשה")}
                  </button>
                }
              >
                {t("עוד אין לך ליגה בענף הזה.")}
              </EmptyState>
            ) : (
              <>
                {needs && (
                  <section className="lg2-needs">
                    <span className="lg2-needs-label">{t("מחכה לך")}</span>
                    <div className="lg2-needs-row">
                      <div className="lg2-needs-text">
                        <span className="lg2-needs-title" dir="auto">
                          {needs.title}
                        </span>
                        <span className="lg2-row-sub" dir="auto">
                          {[
                            needs.match.league_name,
                            needs.match.round_ends_at
                              ? t("נסגר {day}", {
                                  day: dayLabel(new Date(needs.match.round_ends_at), t),
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="lg2-needs-go"
                        onClick={() => navigate(needs.to)}
                      >
                        {needs.action}
                      </button>
                    </div>
                  </section>
                )}
                <div className="lg2-list">{mineSorted.map(mineRow)}</div>
              </>
            ))}

          {activeTab === "open" &&
            (loading ? (
              <RowSkeletons />
            ) : openForMe.length === 0 ? (
              <div className="lg2-empty">
                <span className="lg2-empty-title">{t("אין כרגע ליגות פתוחות")}</span>
                <p className="lg2-empty-text">{t("ליגות חדשות ברמה שלך יופיעו כאן.")}</p>
                <button type="button" className="lg2-empty-go" onClick={requestCreate}>
                  {`+ ${t("פתח ליגה משלך")}`}
                </button>
              </div>
            ) : (
              <div className="lg2-opens">{openForMe.map(openCard)}</div>
            ))}

          {activeTab === "done" &&
            (loading ? (
              <RowSkeletons />
            ) : mineDone.length === 0 ? (
              <EmptyState icon={<TrophyIcon aria-hidden="true" />}>
                {t("עוד לא סיימת עונה בענף הזה.")}
              </EmptyState>
            ) : (
              <div className="lg2-list">{mineDone.map(doneRow)}</div>
            ))}

          {/* The empty "open" tab offers the same thing in its own card, so
              this row would be the second of two identical buttons. */}
          {!openIsEmpty && (
            <button type="button" className="lg2-new" onClick={requestCreate}>
              {`+ ${t("ליגה חדשה")}`}
            </button>
          )}
        </>
      )}

      {showSheet && (
        <div className="sheet-backdrop" onClick={closeSheet}>
          <form className="create-sheet" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <span className="sheet-handle" aria-hidden="true" />
            <h2 className="sheet-title">{t("ליגת {sport} חדשה", { sport: t(selectedSport?.name) })}</h2>

            <label className="sheet-label" htmlFor="league-name">
              {t("שם הליגה")}
            </label>
            <input
              id="league-name"
              ref={inputRef}
              className="sheet-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={40}
            />

            <div className="sheet-label">{t("פורמט")}</div>
            <div className="sheet-chips">
              {FORMAT_OPTIONS.map(([v, label]) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setBestOf(v)}
                  className={`sheet-chip${bestOf === v ? " on" : ""}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>

            <div className="sheet-label">{t("אורך מחזור")}</div>
            <div className="sheet-chips">
              {ROUND_LEN_OPTIONS.map(([v, label]) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setRoundLen(v)}
                  className={`sheet-chip${roundLen === v ? " on" : ""}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>

            {user?.is_admin && (
              <>
                <div className="sheet-label">{t("מי יכול להצטרף")}</div>
                <div className="sheet-chips">
                  {OPEN_OPTIONS.map(([v, label]) => (
                    <button
                      type="button"
                      key={String(v)}
                      onClick={() => setIsOpen(v)}
                      className={`sheet-chip${isOpen === v ? " on" : ""}`}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                <p className="sheet-sub">
                  {isOpen
                    ? t("הליגה תופיע ברשימת הליגות הפתוחות וכל מי שברמה המתאימה יכול להצטרף.")
                    : t("רק מי שקיבל ממך קישור הזמנה יכול להצטרף.")}
                </p>
              </>
            )}

            {isOpen && (
              <>
                <div className="sheet-label">{t("טווח רמות (NTRP)")}</div>
                <div className="sheet-level-row" dir="ltr">
                  <select
                    className="sheet-select"
                    value={levelMin}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setLevelMin(v);
                      if (v > levelMax) setLevelMax(v);
                    }}
                  >
                    {NTRP_STEPS.map((v) => (
                      <option key={v} value={v}>
                        {v.toFixed(1)}
                      </option>
                    ))}
                  </select>
                  <span className="sheet-level-dash">–</span>
                  <select
                    className="sheet-select"
                    value={levelMax}
                    onChange={(e) => setLevelMax(Number(e.target.value))}
                  >
                    {NTRP_STEPS.filter((v) => v >= levelMin).map((v) => (
                      <option key={v} value={v}>
                        {v.toFixed(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="sheet-sub">
                  {t("רק שחקנים בדירוג {min}–{max} יוכלו להצטרף", {
                    min: levelMin.toFixed(1),
                    max: levelMax.toFixed(1),
                  })}
                </p>
              </>
            )}

            {/* Any day, with the next Sunday filled in to start from. The line
                underneath spells the date out, so the field's own dd/mm-or-
                mm/dd ordering can't be read the wrong way round. */}
            <label className="sheet-label" htmlFor="league-starts-at">
              {t("תאריך פתיחה")}
            </label>
            <input
              id="league-starts-at"
              type="date"
              className="sheet-input"
              value={startsAt}
              min={isoDay(new Date())}
              onChange={(e) => setStartsAt(e.target.value)}
            />
            <p className="sheet-sub">
              {startsAt
                ? t("המחזור הראשון נפתח ב{date}", { date: longDate(startsAt, language) })
                : t("בחר את היום שבו המחזור הראשון נפתח.")}
            </p>

            {sheetError && <p className="error">{t(sheetError)}</p>}

            <button type="submit" className="sheet-submit" disabled={submitting || !name.trim()}>
              {submitting ? t("יוצר...") : t("צור ליגה")}
            </button>
            <p className="sheet-hint">{t("אפשר לשנות את הפורמט אחר כך בהגדרות הליגה")}</p>
          </form>
        </div>
      )}

      {showRatingGate && (
        <RatingQuestionnaire
          initial
          sportId={selectedSportId}
          sportName={selectedSport?.name}
          onClose={handleRatingGateDone}
        />
      )}
    </div>
  );
}
