import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { formatWeekdayDateTime } from "../matchUtils.js";

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MAX_CARDS = 3;

// notifications155a.md: no "2 hours ago" anywhere — an age, a weekday, or a
// date, whichever is the shortest true answer.
function stamp(value) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 86400000) return `${Math.max(1, Math.round(diff / 3600000))}H`;
  if (diff < 7 * 86400000) return WEEKDAY_SHORT[date.getDay()];
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Scores and times arrive as values, not as text: they have to be formatted in
// the viewer's own timezone and set as isolated LTR runs, or "6-4 6-3" and
// "THU 10.9 · 22:00" come out backwards inside a Hebrew sentence.
function renderBody(item, english) {
  const body = english && item.body_en ? item.body_en : item.body;
  return body.split(/(\{score\}|\{time\}|\{count\})/).map((part, i) => {
    if (part === "{score}") {
      return (
        <span key={i} className="nt-mono" dir="ltr">
          {item.score}
        </span>
      );
    }
    if (part === "{time}") {
      return (
        <span key={i} className="nt-mono" dir="ltr">
          {item.time ? formatWeekdayDateTime(new Date(item.time)) : ""}
        </span>
      );
    }
    if (part === "{count}") {
      return (
        <span key={i} className="nt-mono" dir="ltr">
          {item.count}
        </span>
      );
    }
    return part;
  });
}

// The one piece of emphasis an update line gets: whoever it is about.
function renderUpdate(item) {
  if (!item.actor_name || !item.body.includes(item.actor_name)) return item.body;
  return item.body.split(item.actor_name).flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <span className="nt-strong" key={i}>
            {item.actor_name}
          </span>,
          part,
        ]
  );
}

export default function Notifications() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showAllCards, setShowAllCards] = useState(false);

  const load = useCallback(() => {
    api
      .notifications()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  async function act(item, run) {
    setBusyId(item.id);
    setError("");
    try {
      await run();
      load();
    } catch (err) {
      if (err.status === 409) {
        // Something needs a decision the card can't hold (which of several
        // proposed times, a back-to-back warning) — that lives on the match.
        navigate(`/matches/${item.match_id}`);
        return;
      }
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function primaryFor(item) {
    if (item.type === "RESULT TO CONFIRM") {
      return { label: t("אשר"), run: () => act(item, () => api.confirmMatchResult(item.match_id)) };
    }
    if (item.type === "TIME PROPOSED") {
      return { label: t("מאשר"), run: () => act(item, () => api.confirmMatchSchedule(item.match_id)) };
    }
    if (item.type === "MATCH TO REPORT") {
      // A score needs a form, so this one opens the match screen.
      return { label: t("דווח תוצאה"), run: () => navigate(`/matches/${item.match_id}`) };
    }
    return { label: t("הצע שעה"), run: () => navigate(`/matches/${item.match_id}/schedule`) };
  }

  function secondaryFor(item) {
    if (item.type === "RESULT TO CONFIRM") {
      return { label: t("חולק"), run: () => navigate(`/matches/${item.match_id}/correct`) };
    }
    if (item.type === "TIME PROPOSED") {
      return { label: t("שעה אחרת"), run: () => navigate(`/matches/${item.match_id}/schedule`) };
    }
    return null;
  }

  async function markAllRead() {
    setError("");
    try {
      await api.markAllNotificationsRead();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !data) return <p className="error">{t(error)}</p>;

  if (!data) {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">{t("NOTIFICATIONS")}</span>
        </div>
        <SkeletonBar width={200} height={32} style={{ marginTop: 18 }} />
      </div>
    );
  }

  const cards = data.action_required ?? [];
  const updates = data.updates ?? [];
  const shownCards = showAllCards ? cards : cards.slice(0, MAX_CARDS);
  const hiddenCards = cards.length - shownCards.length;
  const unreadUpdates = updates.filter((u) => !u.read_at).length;
  const nothingAtAll = cards.length === 0 && updates.length === 0;

  return (
    <div className="nt">
      <div className="nt-head">
        <div className="nt-nav">
          <button type="button" className="nt-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="nt-nav-label">NOTIFICATIONS</span>
        </div>

        {nothingAtAll ? (
          <>
            <h1 className="nt-title">{t("אין התראות")}</h1>
            <p className="nt-empty">{t("כאן יופיעו תוצאות לאישור, הצעות שעה ופתיחת מחזור")}</p>
          </>
        ) : (
          cards.length > 0 && (
            <div className="nt-title-row">
              <h1 className="nt-title">{t("דורש אותך")}</h1>
              <span className="nt-count" dir="ltr">
                {cards.length}
              </span>
            </div>
          )
        )}
      </div>

      {error && <p className="nt-error error">{t(error)}</p>}

      {cards.length > 0 && (
        <div className="nt-cards">
          {shownCards.map((item) => {
            const primary = primaryFor(item);
            const secondary = secondaryFor(item);
            return (
              <div className="nt-card" key={item.id}>
                <div className="nt-card-meta">
                  <span className="nt-dot" aria-hidden="true" />
                  <span className="nt-card-type" dir="ltr">
                    {item.type}
                  </span>
                  <span className="nt-card-age" dir="ltr">
                    {stamp(item.created_at)}
                  </span>
                </div>
                <p className="nt-card-body">{renderBody(item, language === "en")}</p>
                <div className="nt-card-actions">
                  <button
                    type="button"
                    className="nt-primary"
                    disabled={busyId === item.id}
                    onClick={primary.run}
                  >
                    {primary.label}
                  </button>
                  {secondary && (
                    <button
                      type="button"
                      className="nt-secondary"
                      disabled={busyId === item.id}
                      onClick={secondary.run}
                    >
                      {secondary.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {hiddenCards > 0 && (
            <button type="button" className="nt-more" onClick={() => setShowAllCards(true)}>
              {t("עוד {n} דורשים אותך", { n: hiddenCards })}
            </button>
          )}
        </div>
      )}

      {updates.length > 0 && (
        <>
          <h2 className={`nt-updates-head${cards.length === 0 ? " lead" : ""}`}>{t("עדכונים")}</h2>
          <div className="nt-updates">
            {updates.map((item) => {
              const tappable = item.type === "round_open" && item.league_id;
              const Tag = tappable ? "button" : "div";
              return (
                <Tag
                  key={item.id}
                  type={tappable ? "button" : undefined}
                  className={`nt-row${item.read_at ? "" : " unread"}${tappable ? " is-link" : ""}`}
                  onClick={tappable ? () => navigate(`/leagues/${item.league_id}?tab=matches`) : undefined}
                >
                  <span className="nt-row-text">{renderUpdate(item)}</span>
                  <span className="nt-row-stamp" dir="ltr">
                    {stamp(item.created_at)}
                  </span>
                </Tag>
              );
            })}
          </div>
        </>
      )}

      {unreadUpdates > 0 && (
        <div className="nt-foot">
          <button type="button" className="nt-mark-all" onClick={markAllRead}>
            {t("סמן הכל כנקרא")}
          </button>
        </div>
      )}
    </div>
  );
}
