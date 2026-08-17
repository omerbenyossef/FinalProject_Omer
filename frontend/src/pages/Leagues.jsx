import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import EmptyState from "../EmptyState.jsx";
import { TrophyIcon, ChevronIcon } from "../Icons.jsx";
import { SkeletonLeagueCard } from "../Skeleton.jsx";
import { leagueRuleLabels } from "../matchUtils.js";
import PageHelp from "../PageHelp.jsx";

const FORMAT_OPTIONS = [
  [3, "עד 3 סטים"],
  [1, "סט אחד"],
  [5, "עד 5"],
];
const ROUND_LEN_OPTIONS = [
  [7, "שבועי"],
  [14, "כל שבועיים"],
];
const OPEN_OPTIONS = [
  [false, "בהזמנה בלבד"],
  [true, "פתוחה לכולם"],
];
const LEVEL_OPTIONS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5];

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
  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sports, selectedSportId } = useSport();
  const { t } = useLanguage();

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

  function openSheet() {
    setName("");
    setBestOf(3);
    setRoundLen(7);
    setIsOpen(false);
    setLevelMin(1.5);
    setLevelMax(5.5);
    setSheetError("");
    setShowSheet(true);
  }

  function closeSheet() {
    setShowSheet(false);
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
        level_min: levelMin,
        level_max: levelMax,
      });
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      setSheetError(err.message);
      setSubmitting(false);
    }
  }

  const bySelectedSport = (l) => l.sport.id === selectedSportId;
  const openLeagues = leagues.filter((l) => l.is_open && bySelectedSport(l));
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
          <button type="button" className="btn-create-league" onClick={openSheet}>
            {t("צור ליגה חדשה")}
          </button>
        </div>
      ) : (
        <EmptyState
          icon={<TrophyIcon aria-hidden="true" />}
          action={
            <Link to="/login" className="btn-secondary btn-small">
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
          <div className="home-section-head">
            <span>{t("הליגות שלי")}</span>
            <span className="num">{myLeaguesForSport.length}</span>
          </div>
          <div className="rank-row-list">
            {loading ? (
              <SkeletonLeagueCard />
            ) : (
              myLeaguesForSport.map((league) => (
                <Link to={`/leagues/${league.id}`} key={league.id} className="league-row">
                  <span className={`league-row-rank${league.my_rank <= 3 ? " top" : ""}`} dir="ltr">
                    {league.my_rank}
                  </span>
                  <div className="league-row-body">
                    <div className="league-row-name">
                      <span dir="auto">{league.name}</span>
                    </div>
                    <div className="league-row-sub" dir="ltr">
                      {league.my_wins}W-{league.my_losses}L · {league.my_members_total} {t("שחקנים")}
                    </div>
                  </div>
                  {league.my_rank_trend ? (
                    <span className={`league-row-trend ${league.my_rank_trend > 0 ? "up" : "down"}`} dir="ltr">
                      {league.my_rank_trend > 0
                        ? `▲${league.my_rank_trend}`
                        : `▼${Math.abs(league.my_rank_trend)}`}
                    </span>
                  ) : (
                    <span className="league-row-trend" dir="ltr">—</span>
                  )}
                  <ChevronIcon className="league-row-chevron chevron-icon" aria-hidden="true" />
                </Link>
              ))
            )}
            {!loading && myLeaguesForSport.length === 0 && (
              <EmptyState icon={<TrophyIcon aria-hidden="true" />}>
                {t("עדיין לא הצטרפת לאף ליגה בענף הזה.")}
              </EmptyState>
            )}
          </div>
        </>
      )}

      <div className="home-section-head">
        <span>{t("ליגות פתוחות")}</span>
        <span className="num">{openLeagues.length}</span>
      </div>
      <div className="open-league-list">
        {loading ? (
          <SkeletonLeagueCard />
        ) : (
          openLeagues.map((league) => {
            const ruleLabels = leagueRuleLabels(league, t);
            return (
              <Link to={`/leagues/${league.id}`} key={league.id} className="open-league-row">
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
                {LEVEL_OPTIONS.map((v) => (
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
                {LEVEL_OPTIONS.filter((v) => v >= levelMin).map((v) => (
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

            {sheetError && <p className="error">{t(sheetError)}</p>}

            <button type="submit" className="sheet-submit" disabled={submitting || !name.trim()}>
              {submitting ? t("יוצר...") : t("צור ליגה")}
            </button>
            <p className="sheet-hint">{t("אפשר לשנות את הפורמט אחר כך בהגדרות הליגה")}</p>
          </form>
        </div>
      )}
    </div>
  );
}
