import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { api } from "../api.js";
import { SkeletonBar } from "../Skeleton.jsx";
import EmptyState from "../EmptyState.jsx";
import EmptyLine from "../EmptyLine.jsx";
import { ChevronDownIcon, CheckIcon, RanksIcon } from "../Icons.jsx";

const SORT_KEY = "rally.ranks.sort";
const PAGE_LIMIT = 50;

function fmtNum(n) {
  return n.toLocaleString("en-US");
}

function barPct(entry, sort) {
  if (!entry) return 0;
  if (sort === "ntrp") return Math.max(0, Math.min(100, ((entry.ntrp - 1.5) / (7.0 - 1.5)) * 100));
  return Math.max(0, Math.min(100, entry.win_pct));
}

export default function Rankings() {
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t } = useLanguage();

  const [sort, setSort] = useState(() => localStorage.getItem(SORT_KEY) || "ntrp");
  const [sheetOpen, setSheetOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [total, setTotal] = useState(0);
  const [me, setMe] = useState(null);
  const [minMatches, setMinMatches] = useState(5);
  const [players, setPlayers] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);

  const listRef = useRef(null);
  const sentinelRef = useRef(null);
  const myRowRef = useRef(null);
  const pageWrapRef = useRef(null);
  const [pageHeight, setPageHeight] = useState(null);

  const loadFirstPage = useCallback(() => {
    if (!selectedSportId) return;
    setLoading(true);
    setError(false);
    api
      .rankings(selectedSportId, sort, null, PAGE_LIMIT)
      .then((data) => {
        setTotal(data.total);
        setMe(data.me);
        setMinMatches(data.min_matches);
        setPlayers(data.players);
        setNextCursor(data.next_cursor);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [selectedSportId, sort]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(() => {
    if (!selectedSportId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    api
      .rankings(selectedSportId, sort, nextCursor, PAGE_LIMIT)
      .then((data) => {
        setPlayers((prev) => [...prev, ...data.players]);
        setNextCursor(data.next_cursor);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [selectedSportId, sort, nextCursor, loadingMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: listRef.current, rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, players.length]);

  useEffect(() => {
    function measure() {
      if (!pageWrapRef.current) return;
      const top = pageWrapRef.current.getBoundingClientRect().top;
      const tabbar = document.querySelector(".tabbar");
      const tabbarHeight = tabbar ? tabbar.getBoundingClientRect().height : 0;
      setPageHeight(Math.max(320, window.innerHeight - top - tabbarHeight));
    }
    measure();
    window.addEventListener("resize", measure);
    const tabbar = document.querySelector(".tabbar");
    const ro = tabbar ? new ResizeObserver(measure) : null;
    if (ro && tabbar) ro.observe(tabbar);
    return () => {
      window.removeEventListener("resize", measure);
      if (ro) ro.disconnect();
    };
  }, [loading]);

  function handleSortChange(next) {
    if (next !== sort) {
      localStorage.setItem(SORT_KEY, next);
      setSort(next);
    }
    setSheetOpen(false);
  }

  function scrollToMe() {
    if (!me || me.rank == null) return;
    const alreadyLoaded = players.some((p) => p.id === user.id);
    if (alreadyLoaded) {
      myRowRef.current?.scrollIntoView({ block: "center" });
      return;
    }
    const jumpOffset = Math.floor((me.rank - 1) / PAGE_LIMIT) * PAGE_LIMIT;
    api
      .rankings(selectedSportId, sort, String(jumpOffset), PAGE_LIMIT)
      .then((data) => {
        setPlayers(data.players);
        setNextCursor(data.next_cursor);
        requestAnimationFrame(() => myRowRef.current?.scrollIntoView({ block: "center" }));
      })
      .catch(() => {});
  }

  const sportReady = Boolean(selectedSportId);
  const meNoRating = me && me.ntrp == null;
  const meInsufficientRecord = me && !meNoRating && sort === "record" && me.rank == null;

  return (
    <div className="rk-page" ref={pageWrapRef} style={pageHeight ? { height: `${pageHeight}px` } : undefined}>
      <header className="rk-head">
        <p className="rk-eyebrow" dir="ltr">
          {t("YOUR PLACE")} · <span dir="auto" style={{ unicodeBidi: "isolate" }}>{me?.display_name ?? user.name}</span>
        </p>

        {!loading && sportReady && meNoRating ? (
          <EmptyLine
            sentence={t("אתה עוד לא מדורג.")}
            meta={`${Math.max(0, minMatches - (me?.matches_played ?? 0))} MATCHES UNTIL YOU ENTER THE TABLE`}
          />
        ) : (
          <>
            <div className="rk-place">
              <span className="rk-place-num">
                {loading || !sportReady ? <SkeletonBar width={70} height={50} /> : me?.rank}
              </span>
              {!loading && sportReady && (
                <span className="rk-place-of" dir="ltr">
                  {t("מתוך {n}", { n: fmtNum(total) })}
                </span>
              )}
            </div>

            {!loading && sportReady && me && (
              <p className="rk-mine" dir="ltr">
                {`NTRP ${me.ntrp.toFixed(1)} · ${me.wins}-${me.losses} · ${me.win_pct}% ${t("WINS")}`}
              </p>
            )}
          </>
        )}

        <p className="rk-sortline" dir="ltr">
          {!loading && sportReady && (
            <span>
              {fmtNum(total)} {t("PLAYERS")} · {t("SORTED BY")}
            </span>
          )}
          <button
            type="button"
            className="rk-sort"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="listbox"
            aria-expanded={sheetOpen}
          >
            {sort === "ntrp" ? "NTRP" : t("RECORD")}
            <ChevronDownIcon aria-hidden="true" />
          </button>
        </p>
      </header>

      {!loading && !error && total > 0 && (
        <div className="rk-col-head">
          <span className="rk-col-rank" dir="ltr">
            #
          </span>
          <span className="rk-col-player">{t("PLAYER")}</span>
          <span className="rk-col-bar" dir="ltr">
            {sort === "ntrp" ? "1.5 —————— 7.0" : t("WIN %")}
          </span>
          <span className="rk-col-val" dir="ltr">
            {sort === "ntrp" ? "NTRP" : t("W %")}
          </span>
        </div>
      )}

      <ul className="rk-list" ref={listRef}>
        {(loading || !sportReady) &&
          Array.from({ length: 8 }).map((_, i) => (
            <li className="rk-row rk-row-skel" key={i}>
              <SkeletonBar width={26} height={16} />
              <span className="rk-who">
                <SkeletonBar width={90} height={14} />
                <SkeletonBar width={50} height={10} style={{ marginTop: 4 }} />
              </span>
              <SkeletonBar height={3} style={{ flex: 1 }} />
              <SkeletonBar width={30} height={12} />
            </li>
          ))}

        {!loading && error && (
          <li className="rk-error">
            <p>{t("לא הצלחנו לטעון את הדירוג")}</p>
            <button type="button" className="link-btn" onClick={loadFirstPage}>
              {t("נסה שוב")}
            </button>
          </li>
        )}

        {!loading && !error && total === 0 && (
          <li className="rk-empty">
            <EmptyState icon={<RanksIcon aria-hidden="true" />}>
              {sort === "record"
                ? t("עדיין אין שחקן עם מספיק משחקים למיון לפי מאזן")
                : t("עדיין אין דירוג שחקנים בענף הזה")}
            </EmptyState>
          </li>
        )}

        {!loading &&
          !error &&
          players.map((p) => (
            <li className="rk-row" key={p.id} ref={p.id === user.id ? myRowRef : undefined}>
              <span className="rk-rank" dir="ltr">
                {p.rank}
              </span>
              <span className="rk-who">
                {p.id === user.id ? (
                  <span className="rk-name">
                    <span dir="auto" style={{ unicodeBidi: "isolate" }}>{p.display_name}</span>
                  </span>
                ) : (
                  <Link to={`/players/${p.id}`} className="rk-name player-name-link">
                    <span dir="auto" style={{ unicodeBidi: "isolate" }}>{p.display_name}</span>
                  </Link>
                )}
                <span className="rk-sub" dir="ltr">
                  {sort === "ntrp" ? `${p.wins}-${p.losses}` : `NTRP ${p.ntrp.toFixed(1)}`}
                </span>
              </span>
              <span className="rk-bar">
                <i style={{ width: `${barPct(p, sort)}%` }} />
              </span>
              <span className="rk-val" dir="ltr">
                {sort === "ntrp" ? p.ntrp.toFixed(1) : `${p.win_pct}%`}
              </span>
            </li>
          ))}

        {!loading && !error && nextCursor && <li ref={sentinelRef} className="rk-sentinel" aria-hidden="true" />}
      </ul>

      {!loading && sportReady && me && (
        <>
          {meInsufficientRecord ? (
            <div className="rk-me-note">
              <p className="rk-me-note-text">
                {t("עוד {n} משחקים ותיכנס לדירוג לפי מאזן", { n: Math.max(0, minMatches - me.matches_played) })}
              </p>
            </div>
          ) : meNoRating ? (
            <div className="rk-me-note">
              <p className="rk-me-note-text" dir="ltr">
                {`${Math.max(0, minMatches - me.matches_played)} MATCHES UNTIL YOU ENTER THE TABLE`}
              </p>
            </div>
          ) : (
            <button type="button" className="rk-me" onClick={scrollToMe}>
              <span className="rk-rank" dir="ltr">
                {me.rank}
              </span>
              <span className="rk-who">
                <span className="rk-name">
                  <span dir="auto" style={{ unicodeBidi: "isolate" }}>{me.display_name}</span>
                  <span className="rk-you"> · you</span>
                </span>
                <span className="rk-sub" dir="ltr">
                  {sort === "ntrp" ? `${me.wins}-${me.losses}` : `NTRP ${me.ntrp.toFixed(1)}`}
                </span>
              </span>
              <span className="rk-bar">
                <i style={{ width: `${barPct(me, sort)}%` }} />
              </span>
              <span className="rk-val" dir="ltr">
                {sort === "ntrp" ? me.ntrp.toFixed(1) : `${me.win_pct}%`}
              </span>
            </button>
          )}
        </>
      )}

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="create-sheet rk-sort-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-handle" aria-hidden="true" />
            <h2 className="sheet-title">{t("מיון הטבלה")}</h2>
            <div className="rk-sort-options">
              <button
                type="button"
                className={`rk-sort-option${sort === "ntrp" ? " on" : ""}`}
                onClick={() => handleSortChange("ntrp")}
              >
                <span className="rk-sort-option-text">
                  <span className="rk-sort-option-label">{t("דירוג NTRP")}</span>
                  <span className="rk-sort-option-sub" dir="ltr">
                    1.5 — 7.0
                  </span>
                </span>
                {sort === "ntrp" && <CheckIcon aria-hidden="true" />}
              </button>
              <button
                type="button"
                className={`rk-sort-option${sort === "record" ? " on" : ""}`}
                onClick={() => handleSortChange("record")}
              >
                <span className="rk-sort-option-text">
                  <span className="rk-sort-option-label">{t("מאזן נצחונות")}</span>
                  <span className="rk-sort-option-sub" dir="ltr">
                    {t("WIN %")}
                  </span>
                </span>
                {sort === "record" && <CheckIcon aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
