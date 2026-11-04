import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import EmptyState from "../EmptyState.jsx";
import { TrophyIcon, ChevronIcon, PlusIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import {
  leagueRuleLabels,
  NTRP_STEPS,
  currentRoundNumber,
  activeRoundStatus,
  matchSides,
  weekdayFull,
} from "../matchUtils.js";
import { SportIcon } from "../SportSwitcher.jsx";
import OpenLeagueCard from "../OpenLeagueCard.jsx";
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

/* 190b — one row per league of mine: where I stand, how far through the
   season it is, and when I play next. Replaces 175a's row, which said the
   same things in one grey meta line and left the standing out of it
   altogether.

   The next-match line is deliberately neutral ("הבא: …"), not "X is waiting
   for your reply" — that wording belongs to the home screen, and on a list of
   six leagues it reads as six accusations. */
function MyLeagueRow({ league, nextEntry, userId, t, language }) {
  const round = currentRoundNumber(league.schedule_started_at, league.round_length_days || 7);
  const total = league.planned_rounds ?? null;
  // Nothing on the server marks a season finished, so the only signal is the
  // round count running past the planned number of rounds.
  const over = total != null && round != null && round > total;
  const players = league.my_members_total ?? league.member_count ?? 0;
  const place = league.my_rank;
  const { daysLeft } = activeRoundStatus(league.schedule_started_at, league.round_length_days || 7);

  const meta = [];
  if (over) meta.push(t("העונה נגמרה"));
  else if (round != null) meta.push(total ? t("מחזור {n}/{total}", { n: round, total }) : t("מחזור {n}", { n: round }));
  if (!over && daysLeft != null)
    meta.push(daysLeft === 1 ? t("נותר יום אחד") : t("נותרו {n} ימים", { n: daysLeft }));
  if (!over && daysLeft == null && players) meta.push(t("{n} שחקנים", { n: players }));

  // "הבא: שבת 09:00 מול נועם ברק". In padel the opponent is a pair, so the
  // name comes from matchSides rather than from player1/player2.
  let nextLine = null;
  if (!over && nextEntry) {
    const m = nextEntry.match;
    const facing = matchSides(m, userId).opponentLabel;
    if (m.scheduled_at) {
      const at = new Date(m.scheduled_at);
      const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
      nextLine = t("הבא: {day} {time} מול {name}", {
        day: weekdayFull(at, t),
        time: hhmm,
        name: facing,
      });
    } else {
      nextLine = t("הבא: עוד לא נקבעה שעה");
    }
  }

  return (
    <Link to={`/leagues/${league.id}`} className={`lg-row${over ? " is-over" : ""}`}>
      {/* Where I stand, as the first thing on the row — LTR, because "#3" and
          "OF 12" are a number and a count, not words. */}
      <span className="lg-place" dir="ltr">
        {place != null ? (
          <>
            <span className="lg-place-n">#{place}</span>
            <span className="lg-place-of">OF {players}</span>
          </>
        ) : (
          <span className="lg-place-of">{players ? `OF ${players}` : "—"}</span>
        )}
      </span>
      <span className="lg-row-body">
        {/* The block keeps the row's own alignment; only the name itself runs
            in its own direction, so a Hebrew league name doesn't flush right
            in an English list. */}
        <span className="lg-row-name">
          <span dir="auto" style={{ unicodeBidi: "isolate" }}>{league.name}</span>
        </span>
        {meta.length > 0 && (
          <span className="lg-row-meta">
            {meta.map((part, i) => (
              <span key={i} style={{ display: "contents" }}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <span dir="auto" style={{ unicodeBidi: "isolate" }}>{part}</span>
              </span>
            ))}
          </span>
        )}
        {nextLine && (
          <span className="lg-row-next" dir="auto" style={{ unicodeBidi: "isolate" }}>
            {nextLine}
          </span>
        )}
      </span>
      <ChevronIcon className="lg-row-chev" aria-hidden="true" />
    </Link>
  );
}

/* A season that is over: the place is the whole point of the row. */
function DoneLeagueRow({ league, language, t }) {
  const players = league.my_members_total ?? league.member_count ?? 0;
  const place = league.my_rank;
  return (
    <Link to={`/leagues/${league.id}`} className="lg-row is-over">
      <span className="lg-place" dir="ltr">
        {place != null ? (
          <>
            <span className="lg-place-n">#{place}</span>
            <span className="lg-place-of">OF {players}</span>
          </>
        ) : (
          <span className="lg-place-of">{players ? `OF ${players}` : "—"}</span>
        )}
      </span>
      <span className="lg-row-body">
        <span className="lg-row-name">
          <span dir="auto" style={{ unicodeBidi: "isolate" }}>{league.name}</span>
        </span>
        <span className="lg-row-meta">
          {place != null
            ? t("סיימת {place}", { place: rankLabel(place, language, t) })
            : t("העונה נגמרה")}
          {" · "}
          <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
            {league.my_wins ?? 0}-{league.my_losses ?? 0}
          </span>
        </span>
      </span>
      <ChevronIcon className="lg-row-chev" aria-hidden="true" />
    </Link>
  );
}

function SectionHead({ title, end }) {
  return (
    <div className="lg-sec">
      <span className="lg-sec-title">{title}</span>
      <span className="lg-sec-rule" aria-hidden="true" />
      {end}
    </div>
  );
}

function OpenLeagueRow({ league, outOfLevel, t }) {
  const ruleLabels = leagueRuleLabels(league, t);
  return (
    <Link
      to={`/leagues/${league.id}/preview`}
      className={`lg-row lg-row--open${outOfLevel ? " is-out-of-level" : ""}`}
    >
      <span className="lg-row-body">
        <span className="lg-row-name-row">
          <span className="lg-row-name">
            <span dir="auto" style={{ unicodeBidi: "isolate" }}>
              {league.name}
            </span>
          </span>
        </span>
        <span className="lg-row-meta">
          {league.is_doubles
            ? t("{n} צמדים", { n: league.member_count })
            : t("{n} שחקנים", { n: league.member_count })}{" "}
          · {ruleLabels.frequencyLabel} ·{" "}
          <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
            NTRP {(league.level_min ?? 1.5).toFixed(1)}–
            {(league.level_max ?? 7).toFixed(1)}
          </span>
        </span>
      </span>
      <span className={`lg-row-join${outOfLevel ? " is-quiet" : ""}`}>
        {outOfLevel ? t("הצצה") : t("הצטרף")}
      </span>
    </Link>
  );
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

export default function Leagues() {
  const [leagues, setLeagues] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [myLevel, setMyLevel] = useState(null);
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
  const { nextMatches } = useOpenAction();
  const { activePairs } = usePairs();
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
        const mine = await api.myLeagues();
        setMyLeagues(mine);
      } else {
        setMyLeagues([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
  const myLeagueIds = new Set(myLeagues.map((l) => l.id));
  // Whether this league's range would admit this player. It used to decide
  // whether to list the league at all, on the grounds that offering a join
  // that could only come back refused was worse than silence. The preview says
  // why instead of refusing now, so the league is listed and marked: somebody
  // looking for a league wants to know what there is, including what they are
  // not ready for yet.
  const takesMe = (l) =>
    myLevel == null ||
    ((l.level_min ?? 1.5) <= myLevel && myLevel <= (l.level_max ?? 7.0));
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
  const openOutOfRange = openLeagues.filter((l) => !takesMe(l) && hasRoom(l)).sort(bySoonest);
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
  const nextFor = (leagueId) =>
    nextMatches.find((e) => e.league_id === leagueId && e.match.status !== "completed") || null;

  const TABS = [
    { key: "mine", label: t("שלי"), count: mineLive.length },
    { key: "open", label: t("פתוחות"), count: openForMe.length },
    { key: "done", label: t("הסתיימו"), count: mineDone.length },
  ];

  return (
    <div className="lgp">
      {/* 1 · one level down from the hub, so the way back is named. The sport
          is shown, not offered: switching it is the header's job, and two
          sport controls on one screen is one too many. */}
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

      <header className="lgp-head">
        <div className="lgp-head-text">
          <h1 className="lgp-title">{t("ליגות")}</h1>
          <p className="lgp-sub">{t("הכל במקום אחד")}</p>
        </div>
        {user && (
          <button type="button" className="lgp-new" onClick={requestCreate}>
            <PlusIcon aria-hidden="true" />
            {t("ליגה חדשה")}
          </button>
        )}
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
          <div className="lgp-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`lgp-tab${activeTab === tab.key ? " is-on" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="lgp-tab-label">{tab.label}</span>
                <span className="lgp-tab-count" dir="ltr">
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
                {openForMe.length > 0 && (
                  <>
                    {" "}
                    <button type="button" className="lgp-inline-link" onClick={() => setActiveTab("open")}>
                      {t("יש {n} פתוחות ברמה שלך", { n: openForMe.length })}
                    </button>
                  </>
                )}
              </EmptyState>
            ) : (
              <>
                <div className="lg-list">
                  {mineLive.map((league) => (
                    <MyLeagueRow
                      key={league.id}
                      league={league}
                      nextEntry={nextFor(league.id)}
                      userId={user?.id}
                      t={t}
                      language={language}
                    />
                  ))}
                </div>

                {/* The one nudge on this tab: what else you could be in. Hidden
                    entirely when there is nothing open, rather than shown as a
                    card that says zero. */}
                {openForMe.length > 0 && (
                  <div className="lgp-teaser">
                    <div className="lgp-teaser-text">
                      <span className="lgp-teaser-title">
                        {openForMe.length === 1
                          ? t("ליגה אחת פתוחה ברמה שלך")
                          : t("{n} ליגות פתוחות ברמה שלך", { n: openForMe.length })}
                      </span>
                      <span className="lgp-teaser-names" dir="auto" style={{ unicodeBidi: "isolate" }}>
                        {openForMe.map((l) => l.name).join(" · ")}
                      </span>
                    </div>
                    <button type="button" className="lgp-teaser-link" onClick={() => setActiveTab("open")}>
                      {t("לצפייה")}
                    </button>
                  </div>
                )}
              </>
            ))}

          {activeTab === "open" &&
            (loading ? (
              <RowSkeletons />
            ) : (
              <>
                {openForMe.length === 0 ? (
                  <EmptyState
                    icon={<TrophyIcon aria-hidden="true" />}
                    action={
                      <button type="button" className="btn-secondary btn-small" onClick={requestCreate}>
                        {t("פתח ליגה משלך")}
                      </button>
                    }
                  >
                    {t("אין כרגע ליגות פתוחות ברמה שלך")}
                  </EmptyState>
                ) : (
                  <div className="olc-list">
                    {openForMe.map((league) => (
                      <OpenLeagueCard
                        key={league.id}
                        league={league}
                        myLevel={myLevel}
                        busy={joiningId === league.id}
                        joined={joinedIds.includes(league.id)}
                        onJoin={() => joinFromCard(league)}
                        onOpen={() => navigate(`/leagues/${league.id}/preview`)}
                      />
                    ))}
                  </div>
                )}

                {/* Out-of-range leagues keep their own heading inside this tab.
                    The handoff scopes this tab to "open leagues at the user's
                    level", which would hide them again — and being able to see
                    every open league, clearly marked as out of reach, was
                    asked for directly. A dimmed row inside the list above
                    would leave a reader working out why some of them look
                    faded. */}
                {openOutOfRange.length > 0 && (
                  <>
                    <SectionHead title={t("מחוץ לטווח שלי")} />
                    <p className="lg-sec-note">
                      {t("אפשר להיכנס ולראות הכול, אבל לא להצטרף — הרמה שלך מחוץ לטווח של הליגות האלה.")}
                    </p>
                    <div className="lg-list">
                      {openOutOfRange.map((league) => (
                        <OpenLeagueRow key={league.id} league={league} outOfLevel t={t} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ))}

          {activeTab === "done" &&
            (loading ? (
              <RowSkeletons />
            ) : mineDone.length === 0 ? (
              <EmptyState icon={<TrophyIcon aria-hidden="true" />}>
                {t("עוד לא סיימת עונה בענף הזה.")}
              </EmptyState>
            ) : (
              <div className="lg-list">
                {mineDone.map((league) => (
                  <DoneLeagueRow key={league.id} league={league} language={language} t={t} />
                ))}
              </div>
            ))}
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
