import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { formatDayMonth, weekdayShort } from "../matchUtils.js";
import RatingQuestionnaire from "../RatingQuestionnaire.jsx";
import { usePairs } from "../PairContext.jsx";

export default function LeaguePreview() {
  const { leagueId } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinedNow, setJoinedNow] = useState(false);
  const [showRatingGate, setShowRatingGate] = useState(false);
  const { activePairs, selectedPair } = usePairs();
  // Which pair goes in. It used to be whatever the header had selected, and
  // the header no longer selects anything — so a player with more than one
  // partner is asked here, where it is a real choice and the only place the
  // answer matters.
  const [chosenPairId, setChosenPairId] = useState(null);

  // A pairs league is entered by a pair, so somebody with none cannot join —
  // but they can still read the whole screen, which is the point. The button
  // says what is missing instead of failing when pressed.
  const needsPartner = Boolean(preview?.is_doubles) && activePairs.length === 0;
  // Out of the league's level range. Reading the screen is still the point;
  // only joining is refused, and saying so here beats a 403 on the tap.
  const outOfLevel = Boolean(preview?.out_of_level);
  const blocked = needsPartner || outOfLevel;
  const joiningPair = preview?.is_doubles
    ? activePairs.find((p) => p.id === chosenPairId) ??
      activePairs.find((p) => p.id === selectedPair?.id) ??
      activePairs[0] ??
      null
    : null;

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
    if (outOfLevel) return;
    if (needsPartner) {
      navigate("/partners");
      return;
    }
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
    await api.joinLeague(leagueId, undefined, joiningPair?.id ?? null);
    setJoinedNow(true);
  }

  // The questionnaire already calls join itself once it has an answer, so
  // this only needs to pick up where handleJoin left off.
  async function handleRatingJoined() {
    setShowRatingGate(false);
    setJoinedNow(true);
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
      preview.starts_at ? `R1 OPENS ${weekdayShort(new Date(preview.starts_at), t)}` : null,
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

  const rosterTitle = preview.is_doubles
    ? preview.joined === 0
      ? t("עוד אין צמדים בליגה")
      : preview.joined === 1
        ? t("צמד אחד כבר בליגה")
        : t("{count} צמדים כבר בליגה", { count: preview.joined })
    : count === 0
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

      {outOfLevel && (
        <p className="lpv-needs-partner">
          {t("הרמה שלך היא {mine}, והליגה הזו פתוחה לרמות {min}–{max}. אפשר לראות הכול כאן, אבל אי אפשר להצטרף.", {
            mine: preview.my_level?.toFixed(1),
            min: preview.level_min.toFixed(1),
            max: preview.level_max.toFixed(1),
          })}
        </p>
      )}
      {!outOfLevel && needsPartner && (
        <p className="lpv-needs-partner">
          {t("זאת ליגת זוגות — כדי להצטרף צריך שותף. אפשר לראות הכול כאן, ולחזור אחרי שתמצא אחד.")}
        </p>
      )}
      {!blocked && preview.is_doubles && joiningPair && (
        activePairs.length === 1 ? (
          <p className="lpv-needs-partner lpv-needs-partner--ok">
            {t("תצטרפו כצמד עם {name}", { name: joiningPair.partner.name })}
          </p>
        ) : (
          /* Two partners, two possible entries — so the screen asks rather
             than picking one quietly. */
          <div className="lpv-pairpick">
            <span className="lpv-pairpick-label">{t("עם מי אתם נכנסים?")}</span>
            <div className="lpv-pairpick-chips">
              {activePairs.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`pr-chip${p.id === joiningPair.id ? " is-on" : ""}`}
                  onClick={() => setChosenPairId(p.id)}
                >
                  <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                    {p.partner.name}
                  </span>
                  {p.level != null && (
                    <span className="pr-chip-level" dir="ltr">
                      {p.level.toFixed(1)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {error && <p className="lpv-error error">{t(error)}</p>}

      <div className="lpv-foot">
        <span className="lpv-foot-text">{footText}</span>
        <button
          type="button"
          className={`lpv-join${(isFull && !blocked) || outOfLevel ? " is-full" : ""}`}
          onClick={handleJoin}
          disabled={busy || outOfLevel || (isFull && !blocked)}
        >
          {outOfLevel
            ? t("מחוץ לטווח")
            : needsPartner
              ? t("צריך שותף")
              : isFull
                ? t("מלאה")
                : busy
                  ? t("מצטרף...")
                  : t("הצטרף")}
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
