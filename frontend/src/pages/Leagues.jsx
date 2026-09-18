import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import EmptyState from "../EmptyState.jsx";
import { TrophyIcon, ChevronIcon, PlusIcon, RanksIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { leagueRuleLabels, NTRP_STEPS, currentRoundNumber } from "../matchUtils.js";
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

// leagues-page-175a — one row per league instead of a carousel card. The row
// answers "how am I doing there"; the standings themselves are one tap away on
// the league page, so they don't need a preview here.
function MyLeagueRow({ league, hasOpenMatch, t, language }) {
  const round = currentRoundNumber(league.schedule_started_at, league.round_length_days || 7);
  // Nothing on the server marks a season finished, so the only signal is the
  // round count running past the planned number of rounds.
  const over = league.planned_rounds != null && round != null && round > league.planned_rounds;
  const players = league.my_members_total ?? league.member_count ?? 0;
  const rank = league.my_rank;

  const parts = [];
  if (over) parts.push({ key: "over", text: t("העונה נגמרה") });
  else if (round != null) parts.push({ key: "round", text: t("מחזור {n}", { n: round }) });
  if (!over && players) parts.push({ key: "players", text: t("{n} שחקנים", { n: players }) });
  parts.push({
    key: "record",
    text: `${league.my_wins ?? 0}-${league.my_losses ?? 0}`,
    ltr: true,
  });
  if (rank != null)
    parts.push({
      key: "rank",
      text: over
        ? `${rankLabel(rank, language, t)} ${t("מתוך {n}", { n: players })}`
        : rankLabel(rank, language, t),
    });

  return (
    <Link to={`/leagues/${league.id}`} className={`lg-row${over ? " is-over" : ""}`}>
      <span className="lg-row-body">
        {/* The block keeps the row's own alignment; only the name itself runs
            in its own direction, so a Hebrew league name doesn't flush right
            in an English list. */}
        <span className="lg-row-name">
          <span dir="auto" style={{ unicodeBidi: "isolate" }}>{league.name}</span>
        </span>
        <span className="lg-row-meta">
          {parts.map((part, i) => (
            <span key={part.key} style={{ display: "contents" }}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <span dir={part.ltr ? "ltr" : "auto"} style={{ unicodeBidi: "isolate" }}>
                {part.text}
              </span>
            </span>
          ))}
        </span>
      </span>
      {hasOpenMatch && <span className="lg-row-tag">{t("יש לי משחק")}</span>}
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
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sports, selectedSportId } = useSport();
  const { t, language } = useLanguage();
  const { nextMatches } = useOpenAction();
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

  const bySelectedSport = (l) => l.sport.id === selectedSportId;
  const myLeagueIds = new Set(myLeagues.map((l) => l.id));
  // Only leagues that would actually take this player. The server refuses a
  // join from outside a league's level range, so listing one here was offering
  // something that could only come back refused.
  const takesMe = (l) =>
    myLevel == null ||
    ((l.level_min ?? 1.5) <= myLevel && myLevel <= (l.level_max ?? 7.0));
  const openLeagues = leagues.filter(
    (l) => l.is_open && bySelectedSport(l) && !myLeagueIds.has(l.id) && takesMe(l)
  );
  const myLeaguesForSport = myLeagues.filter(bySelectedSport);
  const selectedSport = sports.find((s) => s.id === selectedSportId);

  // The range a league would have to cover to take me — the same half-level
  // window the rest of the app uses for "near my level".
  const myRange =
    myLevel == null
      ? null
      : [
          Math.max(NTRP_STEPS[0], myLevel - 0.5),
          Math.min(NTRP_STEPS[NTRP_STEPS.length - 1], myLevel + 0.5),
        ];

  return (
    <div className="lgp">
      <header className="lg-head">
        <h1 className="lg-h1">{t("ליגות")}</h1>
        {user && (
          <div className="lg-head-actions">
            <button type="button" className="btn-create-league" onClick={requestCreate}>
              {t("ליגה חדשה")}
            </button>
            <Link to="/friendly/new" className="btn-friendly">
              <PlusIcon aria-hidden="true" />
              {/* The mono meta lines elsewhere read "FRIENDLY" from the shared
                  pair; a 13px button wants the sentence-case word, so this one
                  names itself. */}
              {language === "en" ? "Friendly" : "ידידותי"}
            </Link>
          </div>
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

      {user && (loading || myLeaguesForSport.length > 0) && (
        <>
          <SectionHead
            title={t("הליגות שלי")}
            end={
              !loading && (
                <span className="lg-sec-num" dir="ltr">
                  {myLeaguesForSport.length}
                </span>
              )
            }
          />
          {loading ? (
            <RowSkeletons />
          ) : (
            <div className="lg-list">
              {myLeaguesForSport.map((league) => (
                <MyLeagueRow
                  key={league.id}
                  league={league}
                  // The tag comes off the same nextMatches that feed the open
                  // action elsewhere. That list also carries the last finished
                  // match of a league with nothing left to play, so a match
                  // still owed is one that hasn't been settled.
                  hasOpenMatch={nextMatches.some(
                    (e) => e.league_id === league.id && e.match.status !== "completed"
                  )}
                  t={t}
                  language={language}
                />
              ))}
            </div>
          )}
        </>
      )}

      <SectionHead
        title={t("ליגות פתוחות")}
        end={
          myRange && (
            <span className="lg-sec-range">
              {t("ברמה שלי")}{" "}
              <span dir="ltr">
                {myRange[0].toFixed(1)}–{myRange[1].toFixed(1)}
              </span>
            </span>
          )
        }
      />
      {loading ? (
        <RowSkeletons />
      ) : openLeagues.length === 0 ? (
        <EmptyState icon={<TrophyIcon aria-hidden="true" />}>
          {/* There may well be open leagues — just none that would take this
              player, which is a different thing to say. */}
          {leagues.some((l) => l.is_open && bySelectedSport(l) && !myLeagueIds.has(l.id))
            ? t("אין כרגע ליגה פתוחה בטווח הרמה שלך.")
            : t("אין כרגע ליגות פתוחות.")}
        </EmptyState>
      ) : (
        <div className="lg-list">
          {openLeagues.map((league) => {
            const ruleLabels = leagueRuleLabels(league, t);
            return (
              <Link to={`/leagues/${league.id}/preview`} key={league.id} className="lg-row lg-row--open">
                <span className="lg-row-body">
                  <span className="lg-row-name">
                    <span dir="auto" style={{ unicodeBidi: "isolate" }}>{league.name}</span>
                  </span>
                  <span className="lg-row-meta">
                    {t("{n} שחקנים", { n: league.member_count })} · {ruleLabels.frequencyLabel} ·{" "}
                    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                      NTRP {(league.level_min ?? 1.5).toFixed(1)}–
                      {(league.level_max ?? 7).toFixed(1)}
                    </span>
                  </span>
                </span>
                <span className="lg-row-join">{t("הצטרף")}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ranks-entry-173: the secondary way into the rankings, for whoever is
          looking for new opponents rather than their own number. */}
      <Link to="/ranks" className="lg-ranks-row">
        <RanksIcon className="lg-ranks-icon" aria-hidden="true" />
        <span className="lg-ranks-text">
          <span className="lg-ranks-title">{t("כל השחקנים לפי רמה")}</span>
          <span className="lg-ranks-sub">{t("גם מחוץ לליגות שלך")}</span>
        </span>
        <ChevronIcon className="lg-ranks-chev" aria-hidden="true" />
      </Link>

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
                    ? t("הליגה תופיע ברשימת הליגות הפתוחות וכל אחד יכול להצטרף בלי קוד.")
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
