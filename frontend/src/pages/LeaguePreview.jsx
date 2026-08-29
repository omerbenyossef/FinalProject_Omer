import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { getCurrentPosition } from "../geo.js";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { leagueRuleLabels, weekdayShort } from "../matchUtils.js";
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
    getCurrentPosition().then((position) => {
      api
        .getLeaguePreview(leagueId, position || {})
        .then((data) => {
          if (data.is_member) {
            navigate(`/leagues/${leagueId}`, { replace: true });
            return;
          }
          setPreview(data);
        })
        .catch((err) => setError(err.message));
    });
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
          <span className="sched-nav-label">{t("BEFORE YOU JOIN")}</span>
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

  const ruleLabels = leagueRuleLabels(preview, t);
  const perWeek = preview.round_length_days === 7 ? 1 : 0.5;
  const topMeta = [
    preview.location_name,
    preview.distance_km != null ? `${preview.distance_km} KM` : null,
    preview.starts_at ? `STARTS ${weekdayShort(new Date(preview.starts_at))}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const maxBucket = Math.max(1, ...preview.level_histogram);

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("BEFORE YOU JOIN")}</span>
      </div>

      <h1 className="lp-name" dir="rtl">
        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
          {preview.name}
        </span>
      </h1>
      {topMeta && (
        <p className="lp-meta" dir="ltr">
          {topMeta}
        </p>
      )}

      <div className="pp-stats">
        <div className="pp-stat">
          <div className="pp-stat-num" dir="ltr">
            {preview.rounds ?? "—"}
          </div>
          <div className="pp-stat-label">{t("ROUNDS")}</div>
        </div>
        <div className="pp-stat">
          <div className="pp-stat-num" dir="ltr">
            {perWeek}
          </div>
          <div className="pp-stat-label">{t("PER WEEK")}</div>
        </div>
        <div className="pp-stat">
          <div className="pp-stat-num" dir="ltr">
            {preview.joined}
            {preview.capacity != null && <span className="pp-stat-of">/{preview.capacity}</span>}
          </div>
          <div className="pp-stat-label">{t("JOINED")}</div>
        </div>
        <div className="pp-stat">
          <div className="pp-stat-num" dir="ltr">
            {preview.level_min.toFixed(1)}-{preview.level_max.toFixed(1)}
          </div>
          <div className="pp-stat-label">{t("NTRP")}</div>
        </div>
      </div>

      <div className="lp-how">
        <div className="lp-how-label">{t("HOW IT WORKS")}</div>
        <p className="lp-how-line" dir="rtl">
          {ruleLabels.frequencyLabel}
        </p>
        <p className="lp-how-line" dir="rtl">
          {ruleLabels.bestOfLabel}
        </p>
        <p className="lp-how-line" dir="rtl">
          {t("אם לא דיווחתם תוצאה עד סוף המחזור, המשחק לא נספר לאף אחד מהצדדים")}
        </p>
      </div>

      <div className="lp-spread">
        <div className="lp-spread-label">
          {t("LEVEL SPREAD")} · {preview.joined} {t("PLAYERS")}
        </div>
        <div className="lp-spread-bars" dir="ltr">
          {preview.level_histogram.map((count, i) => (
            <div className="lp-spread-col" key={i}>
              <div
                className={`lp-spread-bar${i === preview.my_bucket_index ? " is-me" : ""}`}
                style={{ height: `${Math.max(4, (count / maxBucket) * 46)}px` }}
              />
            </div>
          ))}
        </div>
        {preview.my_level != null && preview.my_bucket_index != null && (
          <div
            className="lp-spread-you"
            style={{
              insetInlineStart: `${((preview.my_bucket_index + 0.5) / preview.level_histogram.length) * 100}%`,
            }}
          >
            {preview.my_level.toFixed(1)} {t("YOU")}
          </div>
        )}
      </div>

      {error && <p className="error">{t(error)}</p>}

      <button type="button" className="lp-join-btn" onClick={handleJoin} disabled={busy}>
        {busy ? t("מצטרף...") : t("הצטרף לליגה")}
      </button>
      <p className="lp-free">{t("FREE · LEAVE ANYTIME BEFORE R1")}</p>

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
