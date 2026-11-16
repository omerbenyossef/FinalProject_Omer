import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { api } from "../api.js";
import Avatar from "../Avatar.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import EmptyState from "../EmptyState.jsx";
import EmptyLine from "../EmptyLine.jsx";
import { ChevronDownIcon, CheckIcon, RanksIcon } from "../Icons.jsx";

const SORT_KEY = "rally.ranks.sort";
const PAGE_LIMIT = 50;

function fmtNum(n) {
  return n.toLocaleString("en-US");
}

// The shared labels are stored for screens that set them in mono capitals.
// Here they are words under a number.
function sentenceCase(label) {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

export default function Rankings() {
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t, language } = useLanguage();

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

  // "8th" is a placing in English; Hebrew has no ordinal suffix to glue to a
  // digit, so there it stays the number.
  function place(rank) {
    if (rank == null) return "—";
    if (language !== "en") return String(rank);
    const teens = rank % 100;
    const suffix = teens >= 11 && teens <= 13 ? "th" : ["th", "st", "nd", "rd"][rank % 10] ?? "th";
    return `${rank}${suffix}`;
  }

  function row(p, isMe) {
    const sub =
      sort === "ntrp" ? `${p.wins}W · ${p.losses}L` : `NTRP ${p.ntrp.toFixed(1)}`;
    const value = sort === "ntrp" ? p.ntrp.toFixed(1) : `${p.win_pct}%`;
    const body = (
      <>
        <span className="rk2-rank" dir="ltr">
          {p.rank}
        </span>
        <Avatar
          name={p.display_name}
          photoUrl={p.photo_url}
          size={36}
          background={isMe ? "var(--court, #c6f24e)" : "#222a36"}
          color={isMe ? "#0e1116" : "#c9cfdb"}
          fontFamily='"IBM Plex Sans", var(--sans)'
          fontSize={14}
        />
        <span className="rk2-who">
          <span className="rk2-name" dir="auto">
            {p.display_name}
            {isMe && <span className="rk2-you">{` · ${t("אתה")}`}</span>}
          </span>
          <span className="rk2-sub" dir="ltr">
            {sub}
          </span>
        </span>
        <span className="rk2-val" dir="ltr">
          {value}
        </span>
      </>
    );
    return isMe ? (
      <li className="rk2-row is-me" key={p.id} ref={myRowRef}>
        {body}
      </li>
    ) : (
      <li className="rk2-row" key={p.id}>
        <Link to={`/players/${p.id}`} className="rk2-link">
          {body}
        </Link>
      </li>
    );
  }

  return (
    <div className="rk2">
      <header className="rk2-head">
        <h1 className="rk2-title">{t("דירוג")}</h1>
        {!loading && sportReady && (
          <span className="rk2-count">{t("{n} שחקנים", { n: fmtNum(total) })}</span>
        )}
      </header>

      {/* Where I stand, in the sport's colour — the one row of this table the
          reader came to find. */}
      {!loading && sportReady && me && !meNoRating && !meInsufficientRecord && (
        <button type="button" className="rk2-me" onClick={scrollToMe}>
          <span className="rk2-me-place">
            <span className="rk2-me-label">{t("המקום שלך")}</span>
            <span className="rk2-me-rank">
              <b dir="ltr">{place(me.rank)}</b>
              <i dir="auto">{t("מתוך {n}", { n: fmtNum(total) })}</i>
            </span>
          </span>
          <span className="rk2-me-stats">
            <span className="rk2-me-stat">
              <b dir="ltr">{me.ntrp.toFixed(1)}</b>
              <i>NTRP</i>
            </span>
            <span className="rk2-me-stat">
              <b dir="ltr">{`${me.wins}–${me.losses}`}</b>
              <i>W–L</i>
            </span>
            <span className="rk2-me-stat">
              <b dir="ltr">{`${me.win_pct}%`}</b>
              <i>{sentenceCase(t("ניצחונות"))}</i>
            </span>
          </span>
        </button>
      )}

      {!loading && sportReady && meNoRating && (
        <EmptyLine
          sentence={t("אתה עוד לא מדורג.")}
          meta={t("עוד {n} משחקים ותיכנס לטבלה", {
            n: Math.max(0, minMatches - (me?.matches_played ?? 0)),
          })}
        />
      )}
      {!loading && sportReady && meInsufficientRecord && (
        <EmptyLine
          sentence={t("עוד {n} משחקים ותיכנס לדירוג לפי מאזן", {
            n: Math.max(0, minMatches - (me?.matches_played ?? 0)),
          })}
        />
      )}

      <div className="rk2-bar">
        <span className="rk2-all">{t("כל השחקנים")}</span>
        <button
          type="button"
          className="rk2-sort"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="listbox"
          aria-expanded={sheetOpen}
        >
          {`${t("מיון")}: `}
          <b>{sort === "ntrp" ? "NTRP" : t("מאזן")}</b>
          <ChevronDownIcon aria-hidden="true" />
        </button>
      </div>

      {error && !loading ? (
        <div className="rk2-card rk2-note">
          <p>{t("לא הצלחנו לטעון את הדירוג")}</p>
          <button type="button" className="link-btn" onClick={loadFirstPage}>
            {t("נסה שוב")}
          </button>
        </div>
      ) : loading || !sportReady ? (
        <ul className="rk2-card rk2-list">
          {Array.from({ length: 8 }).map((_, i) => (
            <li className="rk2-row" key={i}>
              <SkeletonBar width={18} height={14} />
              <SkeletonBar width={36} height={36} />
              <span className="rk2-who">
                <SkeletonBar width={110} height={14} />
                <SkeletonBar width={54} height={10} style={{ marginTop: 4 }} />
              </span>
              <SkeletonBar width={30} height={14} />
            </li>
          ))}
        </ul>
      ) : total === 0 ? (
        <div className="rk2-card rk2-note">
          <EmptyState icon={<RanksIcon aria-hidden="true" />}>
            {sort === "record"
              ? t("עדיין אין שחקן עם מספיק משחקים למיון לפי מאזן")
              : t("עדיין אין דירוג שחקנים בענף הזה")}
          </EmptyState>
        </div>
      ) : (
        <ul className="rk2-card rk2-list" ref={listRef}>
          {players.map((p) => row(p, p.id === user.id))}
          {nextCursor && <li ref={sentinelRef} className="rk2-sentinel" aria-hidden="true" />}
        </ul>
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
                    1.0 — 7.0
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
