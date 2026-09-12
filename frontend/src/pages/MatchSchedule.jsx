import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { useAuth } from "../AuthContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import SetScoreForm from "../SetScoreForm.jsx";
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
  const { user } = useAuth();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [conflictWarning, setConflictWarning] = useState(null);
  const [busy, setBusy] = useState(false);
  // Which of several offered slots this player picked.
  const [pickedOption, setPickedOption] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [requireConfirm, setRequireConfirm] = useState(true);

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

  // match-pending-confirm-159a: a match that already carries a report doesn't
  // belong on a screen whose main action is "report the result".
  if (detail.result_status === "pending_him" || detail.result_status === "disputed") {
    return <Navigate to={`/matches/${matchId}/pending`} replace />;
  }
  if (detail.result_status === "pending_you") {
    return <Navigate to={`/matches/${matchId}/confirm`} replace />;
  }

  async function handleConfirm(overrideConflictWarning = false) {
    setBusy(true);
    setError("");
    try {
      await api.confirmMatchSchedule(matchId, overrideConflictWarning, activeOption);
      navigate(-1);
    } catch (err) {
      if (err.status === 409) {
        setConflictWarning(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  // "Can't make it" never ends the conversation empty-handed: the player who
  // said no lands straight on the propose screen with their own slots.
  async function handleDecline(counter = false) {
    setBusy(true);
    setError("");
    try {
      await api.declineMatchSchedule(matchId);
      navigate(
        counter ? `/matches/${matchId}/schedule` : -1,
        counter ? { replace: true, state: { counter: true } } : undefined
      );
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
        await api.reportFriendlyScore(matchId, sets, requireConfirm);
      } else {
        await api.reportScore(detail.league_id, matchId, sets);
      }
      navigate(-1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleNotPlayed() {
    setBusy(true);
    setError("");
    try {
      await api.reportMatchNotPlayed(matchId);
      navigate(-1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const scheduledDate = detail.scheduled_at ? new Date(detail.scheduled_at) : null;
  const options = detail.time_options ?? [];
  const multi = options.length > 1;
  const busyWindows = (detail.busy_windows ?? []).map((w) => ({
    start: new Date(w.start).getTime(),
    end: new Date(w.end).getTime(),
    whose: w.whose,
  }));
  // An offered slot the viewer has since filled can't be picked — the server
  // would reject it, and the reason belongs on the row.
  function optionBlocked(option) {
    const start = new Date(option.start_at).getTime();
    const end = start + (option.duration_minutes || detail.duration_minutes || 60) * 60000;
    if (start <= Date.now()) return t("עבר");
    const hit = busyWindows.find((w) => start < w.end && w.start < end);
    if (!hit) return null;
    return hit.whose === "opponent" ? t("{name} תפוס", { name: detail.opponent.name }) : t("יש לך משחק");
  }
  const activeOption = multi
    ? (pickedOption ?? options.find((o) => !optionBlocked(o))?.id ?? null)
    : null;
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

        <h1 className="sched-title">
          {multi
            ? t("{name} הציע {count} זמנים", { name: detail.opponent.name, count: options.length })
            : t("{name} הציע", { name: detail.opponent.name })}
        </h1>
        <p className="sched-sub" dir="ltr">
          {detail.round_number ? (
            <>
              {hasHebrewChars(detail.league_name) ? (
                <span className="sched-sub-sans" dir="auto" style={{ unicodeBidi: "isolate" }}>
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

        {multi ? (
          <>
            <div className="sched-options">
              {options.map((option) => {
                const blocked = optionBlocked(option);
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={`sched-option${activeOption === option.id ? " on" : ""}${
                      blocked ? " off" : ""
                    }`}
                    disabled={!!blocked || busy}
                    onClick={() => setPickedOption(option.id)}
                  >
                    <span className="sched-option-time" dir="ltr">
                      {formatWeekdayDateTime(new Date(option.start_at))}
                    </span>
                    {blocked ? (
                      <span className="sched-option-note">{blocked}</span>
                    ) : (
                      <span className="sched-option-dot" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
            {detail.court && <p className="sched-options-court">{detail.court}</p>}
          </>
        ) : (
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
        )}

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
          {proposalExpired && !multi ? (
            <p className="sched-expired-note">{t("הזמן שהוצע כבר עבר, צריך להציע שעה חדשה")}</p>
          ) : multi && activeOption == null ? (
            <p className="sched-expired-note">{t("אף אחד מהזמנים לא פנוי לך, הצע שעה אחרת")}</p>
          ) : (
            <button
              type="button"
              className="sched-send"
              disabled={busy}
              onClick={() => handleConfirm(false)}
            >
              {multi ? t("מאשר את הזמן שבחרתי") : t("מאשר, נשחק")}
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
            <button type="button" className="sched-cant" disabled={busy} onClick={() => handleDecline(true)}>
              {t("CANT MAKE IT")}
            </button>
          </div>
        </div>

        {conflictWarning && (
          <div className="confirm-sheet-overlay" onClick={() => setConflictWarning(null)}>
            <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="confirm-sheet-handle" />
              <div className="confirm-sheet-title">{t("שים לב")}</div>
              <p className="add-round-subtitle">{t(conflictWarning)}</p>
              <div className="add-round-actions">
                <button
                  type="button"
                  className="confirm-sheet-btn-confirm"
                  disabled={busy}
                  onClick={() => {
                    setConflictWarning(null);
                    handleConfirm(true);
                  }}
                >
                  {t("כן, לאשר בכל זאת")}
                </button>
                <button
                  type="button"
                  className="link-btn add-round-cancel"
                  onClick={() => setConflictWarning(null)}
                >
                  {t("ביטול")}
                </button>
              </div>
            </div>
          </div>
        )}
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
        {multi ? (
          <div className="sched-options">
            {options.map((option) => (
              <div className="sched-option is-static" key={option.id}>
                <span className="sched-option-time" dir="ltr">
                  {formatWeekdayDateTime(new Date(option.start_at))}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="sched-hero">
            <div className="sched-hero-time" dir="ltr">
              {formatWeekdayDateTime(scheduledDate)}
            </div>
            {detail.court && <div className="sched-hero-court">{detail.court}</div>}
          </div>
        )}
        {error && <p className="error">{t(error)}</p>}
        <p className="sched-waiting">
          {t("WAITING FOR HIM")} ·{" "}
          <button type="button" className="sched-cancel-link" disabled={busy} onClick={() => handleDecline(false)}>
            {t("CANCEL")}
          </button>
        </p>
      </div>
    );
  }

  // status "set": the time is agreed. Before the match there is nothing to do
  // but change it; once it has passed, this is where the result gets reported
  // (the NEEDS YOU screen's "report" row lands right here).
  const duePassed = scheduledDate ? scheduledDate.getTime() <= Date.now() : false;

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t(duePassed ? "REPORT THE RESULT" : "MATCH IS SET")}</span>
      </div>
      <h1 className="sched-title">{t("מול {name}", { name: detail.opponent.name })}</h1>
      <p className="sched-sub" dir="ltr">
        {detail.round_number ? (
          <>
            {hasHebrewChars(detail.league_name) ? (
              <span className="sched-sub-sans" dir="auto" style={{ unicodeBidi: "isolate" }}>
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
      </p>

      {error && <p className="error">{t(error)}</p>}

      <div className="sched-hero">
        <div className="sched-hero-time" dir="ltr">
          {formatWeekdayDateTime(scheduledDate)}
        </div>
        {detail.court && <div className="sched-hero-court">{detail.court}</div>}
        <div className="sched-hero-meta" dir="ltr">
          {duePassed
            ? "TIME HAS PASSED"
            : daysUntilMatch != null && `IN ${daysUntilMatch} ${daysWord(daysUntilMatch)}`}
          {!duePassed && daysUntilRoundEnd !== null && ` · ROUND ENDS IN ${daysUntilRoundEnd}`}
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

      {reporting ? (
        <SetScoreForm
          // Columns follow the match's own player1/player2 order, so the sets
          // come back out of the form already in the orientation the API wants.
          player1Name={detail.i_am_player1 ? user?.name : detail.opponent.name}
          player2Name={detail.i_am_player1 ? detail.opponent.name : user?.name}
          busy={busy}
          maxSets={detail.max_sets}
          onSubmit={handleReport}
          onCancel={() => setReporting(false)}
          friendlyConfirm={
            detail.kind === "friendly"
              ? {
                  opponentName: detail.opponent.name,
                  checked: requireConfirm,
                  onChange: setRequireConfirm,
                }
              : undefined
          }
        />
      ) : (
        <div className="sched-bottom">
          {duePassed ? (
            <>
              <button type="button" className="sched-send" disabled={busy} onClick={() => setReporting(true)}>
                {t("דווח תוצאה")}
              </button>
              <div className="sched-bottom-row">
                <button
                  type="button"
                  className="sched-other-link"
                  onClick={() => navigate(`/matches/${matchId}/schedule`)}
                >
                  {t("קבע זמן חדש")}
                </button>
                <button type="button" className="sched-cant" disabled={busy} onClick={handleNotPlayed}>
                  {t("המשחק לא בוצע")}
                </button>
              </div>
            </>
          ) : (
            <div className="sched-bottom-row">
              <button
                type="button"
                className="sched-other-link"
                onClick={() => navigate(`/matches/${matchId}/schedule`)}
              >
                {t("הצע שעה אחרת")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
