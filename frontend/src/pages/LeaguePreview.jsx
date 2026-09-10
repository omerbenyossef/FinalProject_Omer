import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { formatDayMonth, weekdayShort } from "../matchUtils.js";
import RatingQuestionnaire from "../RatingQuestionnaire.jsx";

export default function LeaguePreview() {
  const { leagueId } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinedNow, setJoinedNow] = useState(false);
  const [inviteCode, setInviteCode] = useState(null);
  const [showRatingGate, setShowRatingGate] = useState(false);

  useEffect(() => {
    api
      .getLeaguePreview(leagueId)
      .then((data) => {
        if (data.is_member) {
          navigate(`/leagues/${leagueId}`, { replace: true });
          return;
        }
        setPreview(data);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  async function handleJoin() {
    setBusy(true);
    setError("");
    try {
      const check = await api.checkRating(leagueId);
      if (check.has_rating) {
        await finishJoin();
      } else {
        setShowRatingGate(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishJoin() {
    await api.joinLeague(leagueId);
    const code = await api.getInviteCode(leagueId);
    setInviteCode(code.code);
    setJoinedNow(true);
  }

  // The questionnaire already calls join itself once it has an answer, so
  // this only needs to pick up where handleJoin left off.
  async function handleRatingJoined() {
    setShowRatingGate(false);
    try {
      const code = await api.getInviteCode(leagueId);
      setInviteCode(code.code);
      setJoinedNow(true);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !preview) return <p className="error">{t(error)}</p>;

  if (!preview) {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">JOIN LEAGUE</span>
        </div>
        <SkeletonBar width={220} height={38} style={{ marginTop: 18 }} />
      </div>
    );
  }

  if (joinedNow) {
    const openLine = [
      preview.starts_at ? `R1 OPENS ${weekdayShort(new Date(preview.starts_at))}` : null,
      `YOU ARE #${preview.joined + 1}${preview.capacity != null ? ` OF ${preview.capacity}` : ""}`,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <div className="sched-page">
        <div className="sched-nav">
          <span className="sched-nav-label">{t("YOU ARE IN")}</span>
        </div>
        <h1 className="lp-name" dir="rtl">
          <span dir="auto" style={{ unicodeBidi: "isolate" }}>
            {preview.name}
          </span>
        </h1>
        <p className="lp-meta" dir="ltr">
          {openLine}
        </p>

        <div className="lp-next">
          <div className="lp-next-label">{t("WHAT HAPPENS NEXT")}</div>
          <div className="lp-next-step is-first">
            <span className="lp-next-num">1</span>
            <span>{t("שאר השחקנים ממשיכים להצטרף עד תאריך הפתיחה")}</span>
          </div>
          <div className="lp-next-step">
            <span className="lp-next-num">2</span>
            <span>{t("לוח המשחקים נוצר אוטומטית כשהמחזור נפתח")}</span>
          </div>
          <div className="lp-next-step">
            <span className="lp-next-num">3</span>
            <span>{t("תקבלו התראה כשיש לכם משחק לתאם")}</span>
          </div>
        </div>

        <div className="lp-code">
          <div className="lp-code-label">{t("PRIVATE LEAGUE · INVITE CODE")}</div>
          <div className="lp-code-value" dir="ltr">
            {inviteCode}
          </div>
          <p className="lp-code-sub">{t("שתפו את הקוד הזה עם מי שתרצו להזמין ישירות לליגה.")}</p>
        </div>

        <button type="button" className="lp-join-btn" onClick={() => navigate(`/leagues/${leagueId}`)}>
          {t("לעמוד הליגה")}
        </button>
      </div>
    );
  }

  const players = preview.players ?? [];
  const buckets = preview.level_buckets ?? [];
  const count = players.length;
  const capacity = preview.capacity;
  const openSpots = capacity != null ? Math.max(0, capacity - preview.joined) : null;
  const isFull = capacity != null && preview.joined >= capacity;
  const levelSpan = `${preview.level_min.toFixed(1)}\u2013${preview.level_max.toFixed(1)}`;

  const rosterTitle =
    count === 0
      ? t("עוד אין שחקנים בליגה")
      : count === 1
        ? t("שחקן אחד כבר בליגה")
        : t("{count} שחקנים כבר בליגה", { count });

  // Three facts in running prose instead of a row of numbers. The start date
  // and the season length are both optional on a league, so the sentence is
  // built from whichever of them exist.
  const metaParams = {
    leagueName: preview.name,
    min: preview.level_min.toFixed(1),
    max: preview.level_max.toFixed(1),
    date: preview.starts_at ? formatDayMonth(new Date(preview.starts_at)) : "",
    weeks: preview.weeks,
  };
  let metaLine = t("{leagueName}, רמות {min}–{max}.", metaParams);
  if (preview.starts_at && preview.weeks === 1) {
    metaLine = t("{leagueName}, רמות {min}–{max}. המחזור מתחיל ב־{date} ונמשך שבוע אחד.", metaParams);
  } else if (preview.starts_at && preview.weeks) {
    metaLine = t("{leagueName}, רמות {min}–{max}. המחזור מתחיל ב־{date} ונמשך {weeks} שבועות.", metaParams);
  } else if (preview.starts_at) {
    metaLine = t("{leagueName}, רמות {min}–{max}. המחזור מתחיל ב־{date}.", metaParams);
  }

  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

  let footText = "";
  if (isFull) {
    footText = t("{capacity} מתוך {capacity} · אפשר להיכנס לרשימת המתנה", { capacity });
  } else if (count === 0) {
    footText = t("תהיה הראשון");
  } else if (openSpots === 1) {
    footText = t("מקום פנוי אחד מתוך {capacity}", { capacity });
  } else if (openSpots != null) {
    footText = t("{open} מקומות פנויים מתוך {capacity}", { open: openSpots, capacity });
  }

  return (
    <div className="lpv">
      <div className="lpv-head">
        <div className="lpv-nav">
          <button type="button" className="lpv-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="lpv-nav-label">JOIN LEAGUE</span>
        </div>

        <h1 className="lpv-title">{rosterTitle}</h1>
        <p className="lpv-meta">{metaLine}</p>

        {count > 0 && buckets.length > 0 && (
          <div className="lpv-range">
            <div className="lpv-range-head" dir="ltr">
              <span className="lpv-range-label">LEVEL RANGE</span>
              <span className="lpv-range-rule" />
              <span className="lpv-range-span">{levelSpan}</span>
            </div>
            <div className="lpv-bars" dir="ltr">
              {buckets.map((bucket) => (
                <div
                  key={bucket.level}
                  className={`lpv-bar${bucket.count === 0 ? " is-empty" : ""}`}
                  style={{ height: `${bucket.count === 0 ? 8 : Math.max(8, (bucket.count / maxBucket) * 100)}%` }}
                />
              ))}
            </div>
            <div className="lpv-bar-labels" dir="ltr">
              {buckets.map((bucket) => (
                <span className="lpv-bar-label" key={bucket.level}>
                  {bucket.level.toFixed(1)} · {bucket.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {count > 0 && (
        <div className="lpv-roster">
          {players.map((player, i) => (
            <div className="lpv-row" key={player.id}>
              <span className="lpv-row-num" dir="ltr">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="lpv-row-name">
                {player.display_name}
              </span>
              <span className="lpv-row-level" dir="ltr">
                {player.level == null
                  ? "\u2014"
                  : `${player.provisional ? "~" : ""}${player.level.toFixed(1)}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="lpv-error error">{t(error)}</p>}

      <div className="lpv-foot">
        <span className="lpv-foot-text">{footText}</span>
        <button
          type="button"
          className={`lpv-join${isFull ? " is-full" : ""}`}
          onClick={handleJoin}
          disabled={busy || isFull}
        >
          {isFull ? t("מלאה") : busy ? t("מצטרף...") : t("הצטרף")}
        </button>
      </div>

      {showRatingGate && (
        <RatingQuestionnaire
          league={{ id: Number(leagueId), name: preview.name }}
          sportName={preview.sport_name}
          onClose={() => setShowRatingGate(false)}
          onJoined={handleRatingJoined}
        />
      )}
    </div>
  );
}
