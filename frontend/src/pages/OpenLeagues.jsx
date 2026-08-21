import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { getCurrentPosition } from "../geo.js";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { NTRP_STEPS } from "../matchUtils.js";

function metaLine(league) {
  const parts = [];
  if (league.rounds) parts.push(`${league.rounds} ROUNDS`);
  parts.push(`NTRP ${league.level_min.toFixed(1)}-${league.level_max.toFixed(1)}`);
  return parts.join(" · ");
}

export default function OpenLeagues() {
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [leagues, setLeagues] = useState(null);
  const [position, setPosition] = useState(null);
  const [myLevel, setMyLevel] = useState(null);
  const [ntrpMin, setNtrpMin] = useState(null);
  const [ntrpMax, setNtrpMax] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftMin, setDraftMin] = useState(1.5);
  const [draftMax, setDraftMax] = useState(7.0);
  const [error, setError] = useState("");

  useEffect(() => {
    getCurrentPosition().then(setPosition);
    api
      .myRatings()
      .then((ratings) => {
        const mine = ratings.find((r) => r.sport_id === selectedSportId);
        if (mine) {
          setMyLevel(mine.level);
          setNtrpMin(Math.max(1.5, mine.level - 0.5));
          setNtrpMax(Math.min(7.0, mine.level + 0.5));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  useEffect(() => {
    if (!selectedSportId) return;
    setLeagues(null);
    api
      .getOpenLeagues(selectedSportId, {
        lat: position?.lat,
        lng: position?.lng,
        ntrpMin,
        ntrpMax,
      })
      .then(setLeagues)
      .catch((err) => setError(err.message));
  }, [selectedSportId, position, ntrpMin, ntrpMax]);

  function openSheet() {
    setDraftMin(ntrpMin ?? 1.5);
    setDraftMax(ntrpMax ?? 7.0);
    setSheetOpen(true);
  }

  function applyFilter() {
    setNtrpMin(draftMin);
    setNtrpMax(draftMax);
    setSheetOpen(false);
  }

  function clearFilter() {
    setNtrpMin(null);
    setNtrpMax(null);
    setSheetOpen(false);
  }

  const filterLabel =
    ntrpMin != null && ntrpMax != null
      ? `${t("NEAR YOU")} · NTRP ${ntrpMin.toFixed(1)}–${ntrpMax.toFixed(1)}`
      : t("NEAR YOU");

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("OPEN LEAGUES")}</span>
      </div>

      <h1 className="ol-title" dir="ltr">
        {leagues ? t("{n} OPEN", { n: leagues.length }) : <SkeletonBar width={100} height={30} />}
      </h1>

      <button type="button" className="ol-filter" onClick={openSheet}>
        {filterLabel} ▾
      </button>

      {error && <p className="error">{t(error)}</p>}

      <div className="ol-list">
        {leagues === null &&
          Array.from({ length: 4 }).map((_, i) => (
            <div className="ol-row" key={i}>
              <SkeletonBar width="60%" height={18} />
              <SkeletonBar width="80%" height={12} style={{ marginTop: 8 }} />
            </div>
          ))}

        {leagues?.length === 0 && <p className="muted">{t("אין כרגע ליגות פתוחות.")}</p>}

        {leagues?.map((league) => {
          const row = (
            <>
              <div className="ol-row-head">
                <span className="ol-row-name" dir="rtl">
                  <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                    {league.name}
                  </span>
                </span>
                {league.is_full ? (
                  <span className="ol-tag ol-tag-full">{t("FULL")}</span>
                ) : league.best_fit ? (
                  <span className="ol-tag ol-tag-best">{t("BEST FIT")}</span>
                ) : league.distance_km != null ? (
                  <span className="ol-tag ol-tag-distance">{league.distance_km} KM</span>
                ) : null}
              </div>
              <div className="ol-row-meta" dir="ltr">
                {metaLine(league)}
              </div>
              {league.capacity != null && (
                <div className="ol-row-capacity">
                  <div className="ol-capacity-track">
                    <div
                      className="ol-capacity-fill"
                      style={{ width: `${Math.min(100, (league.joined / league.capacity) * 100)}%` }}
                    />
                  </div>
                  <span className="ol-capacity-label" dir="ltr">
                    {league.joined}/{league.capacity}
                  </span>
                </div>
              )}
            </>
          );

          return league.is_full ? (
            <div className="ol-row is-full" key={league.id}>
              {row}
            </div>
          ) : (
            <Link to={`/leagues/${league.id}/preview`} className="ol-row" key={league.id}>
              {row}
            </Link>
          );
        })}
      </div>

      <button type="button" className="ol-have-code" onClick={() => navigate("/leagues/join-by-code")}>
        {t("יש לי קוד הזמנה")}
        <ChevronIcon aria-hidden="true" />
      </button>

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="create-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-handle" aria-hidden="true" />
            <h2 className="sheet-title">{t("סינון לפי NTRP")}</h2>
            <div className="sheet-level-row" dir="ltr">
              <select
                className="sheet-select"
                value={draftMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDraftMin(v);
                  if (v > draftMax) setDraftMax(v);
                }}
              >
                {NTRP_STEPS.map((v) => (
                  <option key={v} value={v}>
                    {v.toFixed(1)}
                  </option>
                ))}
              </select>
              <span className="sheet-level-dash">–</span>
              <select className="sheet-select" value={draftMax} onChange={(e) => setDraftMax(Number(e.target.value))}>
                {NTRP_STEPS.filter((v) => v >= draftMin).map((v) => (
                  <option key={v} value={v}>
                    {v.toFixed(1)}
                  </option>
                ))}
              </select>
            </div>
            {myLevel != null && (
              <p className="sheet-sub">{t("הרמה שלך: {level}", { level: myLevel.toFixed(1) })}</p>
            )}
            <button type="submit" className="sheet-submit" onClick={applyFilter}>
              {t("החל")}
            </button>
            <button type="button" className="link-btn" style={{ marginTop: 10 }} onClick={clearFilter}>
              {t("נקה סינון")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
