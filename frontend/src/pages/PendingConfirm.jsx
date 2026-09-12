import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
import { formatSets, hasHebrewChars, weekdayShort } from "../matchUtils.js";

function dayMonth(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysAgoLabel(date) {
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (days === 0) return "TODAY";
  if (days === 1) return "1 DAY AGO";
  return `${days} DAYS AGO`;
}

function remindedToday(value) {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() < 24 * 3600 * 1000;
}

// match-pending-confirm-159a — a match I already reported, waiting on the
// opponent. The screen the home row used to send to asked me to report it
// again.
export default function PendingConfirm() {
  const { matchId } = useParams();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { reload: reloadOpenAction } = useOpenAction();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reportingScore, setReportingScore] = useState(false);

  function load() {
    api
      .getMatchDetail(matchId)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }

  useEffect(load, [matchId]);

  if (error && !detail) return <p className="error">{t(error)}</p>;

  if (!detail) {
    return (
      <div className="pc">
        <div className="pc-head">
          <button type="button" className="pc-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <SkeletonBar width={220} height={26} style={{ marginTop: 26 }} />
        </div>
      </div>
    );
  }

  // The opponent answered (or the window ran out) while this was open — this
  // screen has nothing left to say about it.
  if (detail.result_status !== "pending_him" && detail.result_status !== "disputed") {
    return <Navigate to={`/matches/${matchId}`} replace />;
  }

  const isDispute = detail.result_status === "disputed";
  const notPlayedClaim = detail.void_reason === "not_played" && detail.corrected_sets == null;
  // In a standoff both sides filed something, so "you reported" has to show
  // whichever of the two is actually mine.
  const iCorrected = detail.corrected_by === user?.id;
  const isCorrection = detail.corrected_sets != null && (iCorrected || !isDispute);
  const mySets = isCorrection ? detail.corrected_sets : detail.reported_sets;
  const reportedAt = detail.reported_at ? new Date(detail.reported_at) : null;
  const name = detail.opponent.name;

  async function handleRemind() {
    setBusy(true);
    setError("");
    try {
      const updated = await api.remindOpenMatch(matchId);
      setDetail((prev) => ({ ...prev, reminder_sent_at: updated.reminder_sent_at }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReport(sets) {
    setBusy(true);
    setError("");
    try {
      if (detail.kind === "friendly") {
        await api.reportFriendlyScore(matchId, sets, true);
      } else {
        await api.reportScore(detail.league_id, matchId, sets);
      }
      setEditing(false);
      setReportingScore(false);
      load();
      reloadOpenAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const metaParts = [
    detail.league_name ? (
      <span key="league" dir={hasHebrewChars(detail.league_name) ? "rtl" : "ltr"}>
        {detail.league_name}
      </span>
    ) : (
      <span key="league">{t("משחק ידידותי")}</span>
    ),
    detail.round_number ? <span key="round">R{detail.round_number}</span> : null,
    detail.scheduled_at ? (
      <span key="date">
        {weekdayShort(new Date(detail.scheduled_at))} {dayMonth(new Date(detail.scheduled_at))}
      </span>
    ) : null,
  ].filter(Boolean);

  const formOpen = editing || reportingScore;

  return (
    <div className="pc">
      <div className="pc-head">
        <button type="button" className="pc-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <h1 className="pc-title">{t("מול {name}", { name })}</h1>
        <div className="pc-meta" dir="ltr">
          {metaParts.map((part, i) => (
            <span className="pc-meta-part" key={i}>
              {i > 0 && <span className="pc-dot">·</span>}
              {part}
            </span>
          ))}
        </div>
      </div>

      {error && <p className="pc-error error">{t(error)}</p>}

      {formOpen ? (
        <div className="pc-form">
          <SetScoreForm
            player1Name={detail.i_am_player1 ? t("אתה") : name}
            player2Name={detail.i_am_player1 ? name : t("אתה")}
            initialSets={reportingScore ? null : mySets}
            busy={busy}
            maxSets={detail.max_sets}
            submitLabel="שמור דיווח"
            onSubmit={(sets) =>
              handleReport(
                detail.i_am_player1
                  ? sets
                  : sets.map((set) => ({
                      player1_games: set.player2_games,
                      player2_games: set.player1_games,
                    }))
              )
            }
            onCancel={() => {
              setEditing(false);
              setReportingScore(false);
            }}
          />
        </div>
      ) : (
        <>
          <div className="pc-rows">
            <div className="pc-row">
              <span className="pc-label">{t("דיווחת")}</span>
              <span className="pc-value">
                {notPlayedClaim ? (
                  t("המשחק לא שוחק")
                ) : isCorrection ? (
                  <>
                    {t("תיקון ל־")}
                    <span className="pc-score" dir="ltr">
                      {formatSets(mySets)}
                    </span>
                  </>
                ) : (
                  <span className="pc-score" dir="ltr">
                    {formatSets(mySets)}
                  </span>
                )}
              </span>
            </div>

            {reportedAt && (
              <div className="pc-row">
                <span className="pc-label">{t("נשלח")}</span>
                <span className="pc-value pc-sent" dir="ltr">
                  {dayMonth(reportedAt)} · {daysAgoLabel(reportedAt)}
                </span>
              </div>
            )}

            <div className="pc-row">
              <span className="pc-label">{t("מצב")}</span>
              {isDispute ? (
                <span className="pc-value pc-state pc-state--dispute">
                  {t("{name} דיווח/ה תוצאה אחרת", { name })}
                </span>
              ) : (
                <span className="pc-value pc-state">
                  <span className="pc-dot-lime" aria-hidden="true" />
                  {t("מחכה לאישור של {name}", { name })}
                </span>
              )}
            </div>
          </div>

          {isDispute ? (
            <>
              <div className="pc-scores">
                <div className="pc-scores-row">
                  <span>{t("אתה")}</span>
                  <span className="pc-score" dir="ltr">
                    {formatSets(detail.reported_sets)}
                  </span>
                </div>
                <div className="pc-scores-row">
                  <span>{name}</span>
                  <span className="pc-score" dir="ltr">
                    {formatSets(detail.corrected_sets)}
                  </span>
                </div>
              </div>
              <p className="pc-impact">
                {t("המשחק לא נספר בטבלה ולא משפיע על הדירוג.")}
              </p>
              <div className="pc-actions">
                <span className="pc-locked">{t("מנהל הליגה יכריע")}</span>
              </div>
            </>
          ) : (
            <>
              <p className="pc-impact">
                {t("עד ש{name} יאשר, המשחק לא נספר בטבלה ולא משפיע על הדירוג.", { name })}
              </p>

              <div className="pc-actions">
                {detail.can_edit ? (
                  <>
                    {remindedToday(detail.reminder_sent_at) ? (
                      <span className="pc-btn pc-btn--sent">{t("תזכורת נשלחה היום")}</span>
                    ) : (
                      <button
                        type="button"
                        className="pc-btn pc-btn--primary"
                        disabled={busy}
                        onClick={handleRemind}
                      >
                        {t("שלח תזכורת")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="pc-btn pc-btn--ghost"
                      disabled={busy}
                      onClick={() => setEditing(true)}
                    >
                      {t("ערוך את הדיווח")}
                    </button>
                    {notPlayedClaim && (
                      <button type="button" className="pc-link" onClick={() => setReportingScore(true)}>
                        {t("בעצם שיחקנו — דווח תוצאה")}
                      </button>
                    )}
                  </>
                ) : (
                  <span className="pc-locked">{t("המחזור נסגר, אי אפשר לשנות את הדיווח")}</span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
