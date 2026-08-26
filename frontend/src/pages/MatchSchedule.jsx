import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import {
  formatSets,
  formatWeekdayDateTime,
  hasHebrewChars,
  roundDueDateObj,
  timeAgoLabel,
  daysWord,
} from "../matchUtils.js";

export default function MatchSchedule() {
  const { matchId } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function reload() {
    api
      .getMatchDetail(matchId)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }

  useEffect(reload, [matchId]);

  if (error) return <p className="error">{t(error)}</p>;

  if (!detail) {
    return (
      <div>
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
        </div>
        <SkeletonBar width={200} height={32} style={{ marginTop: 18 }} />
      </div>
    );
  }

  if (detail.status === "no_time") {
    return <Navigate to={`/matches/${matchId}/schedule`} replace />;
  }

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      await api.confirmMatchSchedule(matchId);
      navigate(-1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    setBusy(true);
    setError("");
    try {
      await api.declineMatchSchedule(matchId);
      navigate(-1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const scheduledDate = detail.scheduled_at ? new Date(detail.scheduled_at) : null;
  const roundEnd = detail.round_number
    ? roundDueDateObj(detail.schedule_started_at, detail.round_number, detail.round_length_days || 7)
    : null;
  const daysUntilMatch = scheduledDate ? Math.ceil((scheduledDate.getTime() - Date.now()) / 86400000) : null;
  const daysUntilRoundEnd = roundEnd ? Math.max(0, Math.ceil((roundEnd.getTime() - Date.now()) / 86400000)) : null;
  const proposalExpired = scheduledDate ? scheduledDate.getTime() < Date.now() : false;

  if (detail.status === "asked_you") {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">{t("TIME PROPOSED")}</span>
        </div>

        <h1 className="sched-title">{t("{name} הציע", { name: detail.opponent.name })}</h1>
        <p className="sched-sub" dir="ltr">
          {detail.round_number ? (
            <>
              {hasHebrewChars(detail.league_name) ? (
                <span className="sched-sub-sans" dir="auto">
                  {detail.league_name}
                </span>
              ) : (
                detail.league_name?.toUpperCase()
              )}{" "}
              · R{detail.round_number}
            </>
          ) : (
            "FRIENDLY"
          )}
          {detail.schedule_proposed_at && ` · ${timeAgoLabel(new Date(detail.schedule_proposed_at))}`}
        </p>

        {error && <p className="error">{t(error)}</p>}

        <div className="sched-hero">
          <div className="sched-hero-time" dir="ltr">
            {formatWeekdayDateTime(scheduledDate)}
          </div>
          {detail.court && <div className="sched-hero-court">{detail.court}</div>}
          <div className="sched-hero-meta" dir="ltr">
            {proposalExpired
              ? "TIME HAS PASSED"
              : daysUntilMatch != null && `IN ${daysUntilMatch} ${daysWord(daysUntilMatch)}`}
            {!proposalExpired && daysUntilRoundEnd !== null && ` · ROUND ENDS IN ${daysUntilRoundEnd}`}
          </div>
        </div>

        <div className="sched-h2h">
          <div className="sched-h2h-score" dir="ltr">
            {detail.h2h_wins}-{detail.h2h_losses}
          </div>
          <div className="sched-h2h-meta" dir="ltr">
            {detail.last_match_sets && `LAST ${formatSets(detail.last_match_sets)} · `}
            {detail.my_ntrp != null && detail.opponent_ntrp != null
              ? `NTRP ${detail.my_ntrp.toFixed(1)} · ${detail.opponent_ntrp.toFixed(1)}`
              : ""}
          </div>
        </div>

        <div className="sched-bottom">
          {proposalExpired ? (
            <p className="sched-expired-note">{t("הזמן שהוצע כבר עבר, צריך להציע שעה חדשה")}</p>
          ) : (
            <button type="button" className="sched-send" disabled={busy} onClick={handleConfirm}>
              {t("מאשר, נשחק")}
            </button>
          )}
          <div className="sched-bottom-row">
            <button
              type="button"
              className="sched-other-link"
              onClick={() => navigate(`/matches/${matchId}/schedule`)}
            >
              {t("הצע שעה אחרת")}
            </button>
            <button type="button" className="sched-cant" disabled={busy} onClick={handleDecline}>
              {t("CANT MAKE IT")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (detail.status === "sent") {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
        </div>
        <h1 className="sched-title">{t("מול {name}", { name: detail.opponent.name })}</h1>
        <div className="sched-hero">
          <div className="sched-hero-time" dir="ltr">
            {formatWeekdayDateTime(scheduledDate)}
          </div>
          {detail.court && <div className="sched-hero-court">{detail.court}</div>}
        </div>
        {error && <p className="error">{t(error)}</p>}
        <p className="sched-waiting">
          {t("WAITING FOR HIM")} ·{" "}
          <button type="button" className="sched-cancel-link" disabled={busy} onClick={handleDecline}>
            {t("CANCEL")}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
      </div>
      <h1 className="sched-title">{t("מול {name}", { name: detail.opponent.name })}</h1>
      <div className="sched-hero">
        <div className="sched-hero-time" dir="ltr">
          {formatWeekdayDateTime(scheduledDate)}
        </div>
        {detail.court && <div className="sched-hero-court">{detail.court}</div>}
      </div>
    </div>
  );
}
