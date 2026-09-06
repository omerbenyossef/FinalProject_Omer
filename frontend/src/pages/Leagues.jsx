import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import EmptyState from "../EmptyState.jsx";
import { TrophyIcon, ChevronIcon, PlusIcon } from "../Icons.jsx";
import { SkeletonBar, SkeletonLeagueCard } from "../Skeleton.jsx";
import {
  leagueRuleLabels,
  NTRP_STEPS,
  getActionCandidates,
  buildOpenAction,
  pickStandingsExcerpt,
  activeRoundStatus,
  daysLeftPhrase,
} from "../matchUtils.js";
import PageHelp from "../PageHelp.jsx";
import { getCurrentPosition } from "../geo.js";
import RatingQuestionnaire from "../RatingQuestionnaire.jsx";

const CARD_WIDTH = 305;
const CARD_GAP = 12;

function LeagueCarouselCard({ league, standingsRows, openAction, userId, t, navigate, single }) {
  const { round: currentRound, daysLeft } = activeRoundStatus(
    league.schedule_started_at,
    league.round_length_days || 7
  );

  const rankedRows = Array.isArray(standingsRows) ? standingsRows.map((r, i) => ({ ...r, rank: i + 1 })) : null;
  const meRow = rankedRows?.find((r) => r.user.id === userId);
  const rankDelta = meRow?.rank_delta ?? 0;
  const excerptRows = rankedRows ? pickStandingsExcerpt(rankedRows, userId) : null;

  return (
    <div className={`lg-card${single ? " single" : ""}`}>
      <div className="lg-card-top">
        <div className="lg-card-id">
          <Link to={`/leagues/${league.id}`} className="lg-card-name">
            <span dir="auto">{league.name}</span>
          </Link>
          <div className="lg-card-meta" dir="ltr">
            {currentRound !== null
              ? `${t("מחזור {n}", { n: currentRound })} · ${daysLeftPhrase(daysLeft, t)}`
              : `${league.my_members_total} ${t("שחקנים")}`}
            {" · "}
            {league.is_open ? "PUBLIC" : "PRIVATE"}
          </div>
        </div>
        <div className="lg-card-rank">
          <div className="lg-rank-num" dir="ltr">
            {league.my_rank}
            <span className="lg-rank-of">/{league.my_members_total}</span>
          </div>
          {rankDelta !== 0 && (
            <div className="lg-rank-delta" dir="ltr">
              {rankDelta > 0 ? "▲" : "▼"}
              {Math.abs(rankDelta)}
            </div>
          )}
        </div>
      </div>

      <div className="lg-standings">
        {excerptRows === null
          ? Array.from({ length: 4 }).map((_, i) => (
              <div className="lg-srow" key={i}>
                <SkeletonBar width={14} height={12} />
                <SkeletonBar width="55%" height={13} />
                <SkeletonBar width={28} height={12} />
              </div>
            ))
          : excerptRows.map((row) => (
              <div key={row.user.id} className={row.user.id === userId ? "lg-srow is-me" : "lg-srow"}>
                <span className="lg-srank" dir="ltr">
                  {row.rank}
                </span>
                <span className="lg-sname">
                  {row.user.id === userId ? (
                    <span dir="auto">{row.user.name}</span>
                  ) : (
                    <Link to={`/players/${row.user.id}`} className="player-name-link" dir="auto">
                      {row.user.name}
                    </Link>
                  )}
                </span>
                <span className="lg-swl" dir="ltr">
                  {row.wins}-{row.losses}
                </span>
              </div>
            ))}
      </div>

      {openAction && (
        <button type="button" className="lg-card-action" onClick={() => navigate(`/leagues/${league.id}`)}>
          <span className="lg-dot-lime" aria-hidden="true" />
          <span className="lg-action-body">
            <span className="lg-action-title">{openAction.title}</span>
            <span className="lg-action-sub" dir="ltr">
              {openAction.subParts.map((part, i) => (
                <span key={i} style={{ display: "contents" }}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  <span dir="auto">{part}</span>
                </span>
              ))}
            </span>
          </span>
          <ChevronIcon aria-hidden="true" />
        </button>
      )}
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

export default function Leagues() {
  const [leagues, setLeagues] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSheet, setShowSheet] = useState(false);
  const [name, setName] = useState("");
  const [bestOf, setBestOf] = useState(3);
  const [roundLen, setRoundLen] = useState(7);
  const [isOpen, setIsOpen] = useState(false);
  const [levelMin, setLevelMin] = useState(1.5);
  const [levelMax, setLevelMax] = useState(5.5);
  const [capacity, setCapacity] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [locationName, setLocationName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [active, setActive] = useState(0);
  const [standingsCache, setStandingsCache] = useState({});
  const [showRatingGate, setShowRatingGate] = useState(false);
  const inputRef = useRef(null);
  const carouselRef = useRef(null);
  const requestedStandingsRef = useRef(new Set());
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sports, selectedSportId } = useSport();
  const { t } = useLanguage();
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

  useEffect(() => {
    setActive(0);
  }, [selectedSportId]);

  useEffect(() => {
    const forSport = myLeagues.filter((l) => l.sport.id === selectedSportId);
    const ids = [forSport[active]?.id, forSport[active + 1]?.id].filter((id) => id != null);
    ids.forEach((id) => {
      if (requestedStandingsRef.current.has(id)) return;
      requestedStandingsRef.current.add(id);
      api
        .getStandings(id)
        .then((rows) => setStandingsCache((prev) => ({ ...prev, [id]: rows })))
        .catch(() => setStandingsCache((prev) => ({ ...prev, [id]: [] })));
    });
  }, [active, myLeagues, selectedSportId]);

  function handleCarouselScroll() {
    const el = carouselRef.current;
    if (!el) return;
    const idx = Math.round(Math.abs(el.scrollLeft) / (CARD_WIDTH + CARD_GAP));
    setActive((prev) => (prev === idx ? prev : idx));
  }

  function openSheet() {
    setName("");
    setBestOf(3);
    setRoundLen(7);
    setIsOpen(false);
    setLevelMin(1.5);
    setLevelMax(5.5);
    setCapacity("");
    setStartsAt("");
    setLocationName("");
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
      const position = await getCurrentPosition();
      const league = await api.createLeague({
        name: name.trim(),
        description: "",
        sport_id: selectedSportId,
        is_open: isOpen,
        best_of: bestOf,
        round_length_days: roundLen,
        level_min: levelMin,
        level_max: levelMax,
        capacity: capacity.trim() ? Number(capacity) : null,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        location_name: locationName.trim() || null,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
      });
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      setSheetError(err.message);
      setSubmitting(false);
    }
  }

  const bySelectedSport = (l) => l.sport.id === selectedSportId;
  const myLeagueIds = new Set(myLeagues.map((l) => l.id));
  const openLeagues = leagues.filter((l) => l.is_open && bySelectedSport(l) && !myLeagueIds.has(l.id));
  const myLeaguesForSport = myLeagues.filter(bySelectedSport);
  const selectedSport = sports.find((s) => s.id === selectedSportId);

  return (
    <div>
      <header className="page-head">
        <div className="home-head-top">
          <h1 className="home-name">{t("ליגות")}</h1>
          <PageHelp
            pageKey="leagues"
            title="עמוד הליגות"
            text="כאן תוכלו לראות את הליגות שאתם חברים בהן, לעיין בליגות ציבוריות פתוחות, וליצור ליגה חדשה."
          />
        </div>
        {selectedSport && <div className="home-summary">{t(selectedSport.name)}</div>}
      </header>

      {user ? (
        <div className="leagues-actions">
          <button type="button" className="btn-create-league" onClick={requestCreate}>
            {t("צור ליגה חדשה")}
          </button>
          <Link to="/friendly/new" className="btn-friendly">
            <PlusIcon aria-hidden="true" />
            {t("משחק ידידותי")}
          </Link>
        </div>
      ) : (
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

      {user && loading && <SkeletonLeagueCard />}

      {user && !loading && myLeaguesForSport.length > 0 && (
        <>
          <div className="lg-head">
            <h2 className="lg-title">{t("הליגות שלי")}</h2>
            {myLeaguesForSport.length > 1 && (
              <span className="lg-count" dir="ltr">
                {active + 1} / {myLeaguesForSport.length}
              </span>
            )}
          </div>

          <div
            className={`lg-carousel${myLeaguesForSport.length === 1 ? " single" : ""}`}
            ref={carouselRef}
            onScroll={handleCarouselScroll}
          >
            {myLeaguesForSport.map((league) => {
              const leagueEntries = nextMatches.filter((e) => e.league_id === league.id);
              const leagueOpenAction = buildOpenAction(
                getActionCandidates(leagueEntries, user.id),
                user.id,
                t
              );
              return (
                <LeagueCarouselCard
                  key={league.id}
                  league={league}
                  standingsRows={standingsCache[league.id]}
                  openAction={leagueOpenAction}
                  userId={user.id}
                  t={t}
                  navigate={navigate}
                  single={myLeaguesForSport.length === 1}
                />
              );
            })}
          </div>

          {myLeaguesForSport.length > 1 && (
            <div className="lg-dots">
              {myLeaguesForSport.map((league, i) => (
                <span key={league.id} className={i === active ? "lg-dot is-on" : "lg-dot"} />
              ))}
            </div>
          )}
        </>
      )}

      <Link to="/leagues/open" className="lg-open-head">
        <span>{t("ליגות פתוחות")}</span>
        <span>{openLeagues.length}</span>
      </Link>
      <div className="open-league-list">
        {loading ? (
          <SkeletonLeagueCard />
        ) : (
          openLeagues.map((league) => {
            const ruleLabels = leagueRuleLabels(league, t);
            return (
              <Link to={`/leagues/${league.id}/preview`} key={league.id} className="open-league-row">
                <div className="open-league-body">
                  <div className="open-league-name">
                    <span dir="auto">{league.name}</span>
                  </div>
                  <div className="open-league-meta" dir="ltr">
                    {league.member_count} {t("שחקנים")} · {ruleLabels.frequencyLabel} · {ruleLabels.bestOfLabel} · NTRP{" "}
                    {(league.level_min ?? 1.5).toFixed(1)}–{(league.level_max ?? 5.5).toFixed(1)}
                  </div>
                </div>
                <span className="open-league-join">{t("הצטרף")}</span>
              </Link>
            );
          })
        )}
        {!loading && openLeagues.length === 0 && (
          <EmptyState icon={<TrophyIcon aria-hidden="true" />}>{t("אין כרגע ליגות פתוחות.")}</EmptyState>
        )}
      </div>

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

            <label className="sheet-label" htmlFor="league-location">
              {t("מיקום (אופציונלי)")}
            </label>
            <input
              id="league-location"
              type="text"
              className="sheet-input"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder={t("לדוגמה: רמת גן")}
              maxLength={40}
            />

            <label className="sheet-label" htmlFor="league-capacity">
              {t("קיבולת (אופציונלי)")}
            </label>
            <input
              id="league-capacity"
              type="number"
              min="2"
              className="sheet-input"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={t("ללא הגבלה")}
            />

            <label className="sheet-label" htmlFor="league-starts-at">
              {t("תאריך פתיחה (אופציונלי)")}
            </label>
            <input
              id="league-starts-at"
              type="date"
              className="sheet-input"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />

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
