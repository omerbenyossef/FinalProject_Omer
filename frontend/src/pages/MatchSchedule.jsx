import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import MatchSet from "./MatchSet.jsx";
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

function MatchNav({ label, matchId, unread, t, navigate }) {
  return (
    <div className="sched-nav">
      <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
        <ChevronIcon aria-hidden="true" />
      </button>
      {label && <span className="sched-nav-label">{label}</span>}
      {matchId != null && (
        <button
          type="button"
          className="sched-nav-chat"
          onClick={() => navigate(`/matches/${matchId}/chat`)}
        >
          {t("צ'אט")}
          {unread > 0 && <span className="sched-nav-chat-dot" aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

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
        <MatchNav t={t} navigate={navigate} />
        <SkeletonBar width={200} height={32} style={{ marginTop: 18 }} />
      </div>
    );
  }

  // Both players agreed it was never played: the only thing left to do with
  // it is put it in a later round.
  if (
    detail.league_id &&
    detail.result_status === "disputed" &&
    detail.void_reason === "not_played" &&
    !detail.corrected_sets
  ) {
    return <Navigate to={`/matches/${matchId}/reschedule`} replace />;
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

  // Saying "that isn't what we agreed" is not a counter-proposal — there are
  // no proposals any more. It clears the time and drops both of them back
  // into the conversation that produced it.
  async function handleDecline(toChat = false) {
    setBusy(true);
    setError("");
    try {
      await api.declineMatchSchedule(matchId);
      navigate(toChat ? `/matches/${matchId}/chat` : -1, toChat ? { replace: true } : undefined);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite(accept) {
    setBusy(true);
    setError("");
    try {
      if (accept) await api.acceptFriendlyInvite(matchId);
      else await api.declineFriendlyInvite(matchId);
      if (accept) reload();
      else navigate(-1);
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
  const placeName = detail.venue?.name || detail.court || null;

  // Nothing is agreed yet. Everything that used to happen here — offer a time,
  // accept it, offer another, say you can't make it — happens in the chat now,
  // between two people who know their own week better than a grid of slots
  // does. This screen only has to get them there, give them a way to look at
  // the courts, and take the answer down once they have one.
  if (detail.status === "no_time") {
    const invitePending = detail.kind === "friendly" && detail.invite_status === "pending";
    const iInvited = detail.invited_by === user?.id;
    return (
      <div className="sched-page">
        <MatchNav label={t("SCHEDULE")} t={t} navigate={navigate} />

        <h1 className="sched-title">
          {!invitePending
            ? t("קבעו זמן לשחק")
            : iInvited
            ? t("ההזמנה נשלחה")
            : t("{name} מזמין/ה אותך לשחק", { name: detail.opponent.name })}
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
              · {t("מחזור {n}", { n: detail.round_number })}
              {daysUntilRoundEnd !== null &&
                ` · ${t("נסגר בעוד")} ${daysUntilRoundEnd} ${daysWord(daysUntilRoundEnd, t)}`}
            </>
          ) : (
            <span dir="auto">
              {t("ידידותי")} · <span style={{ unicodeBidi: "isolate" }}>{detail.opponent.name}</span>
            </span>
          )}
        </p>

        {error && <p className="error">{t(error)}</p>}

        {/* An invitation nobody has answered has nothing to arrange yet. */}
        {invitePending ? (
          iInvited ? (
            <p className="notime-hint">
              {t("ברגע ש{name} יאשר/תאשר, תוכלו לתאם ביניכם", { name: detail.opponent.name })}
            </p>
          ) : (
            <div className="notime-actions">
              <button
                type="button"
                className="sched-send"
                disabled={busy}
                onClick={() => handleInvite(true)}
              >
                {t("אשר הזמנה")}
              </button>
              <button
                type="button"
                className="notime-ghost"
                disabled={busy}
                onClick={() => handleInvite(false)}
              >
                {t("דחה הזמנה")}
              </button>
            </div>
          )
        ) : (
          <>
            <p className="notime-hint">
              {t("סכמו ביניכם בצ'אט מתי ואיפה, ואז הזינו כאן את הזמן שקבעתם")}
            </p>
            <div className="notime-actions">
              <button
                type="button"
                className="sched-send notime-chat"
                onClick={() => navigate(`/matches/${matchId}/chat`)}
              >
                {t("צ'אט לתאם זמן")}
                {detail.unread_messages > 0 && <span className="notime-chat-dot" aria-hidden="true" />}
              </button>
              {/* The courts, and the way out to their own booking pages. */}
              <button
                type="button"
                className="notime-ghost"
                onClick={() => navigate(`/matches/${matchId}/schedule`)}
              >
                {t("בדוק זמינות מגרשים")}
              </button>
              <button
                type="button"
                className="notime-ghost"
                onClick={() => navigate(`/matches/${matchId}/schedule?step=when`)}
              >
                {t("קבענו — הזן זמן")}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (detail.status === "asked_you") {
    return (
      <div className="sched-page">
        <MatchNav
          label={t("לאישור")}
          matchId={matchId}
          unread={detail.unread_messages}
          t={t}
          navigate={navigate}
        />

        <h1 className="sched-title">
          {multi
            ? t("{name} הציע {count} זמנים", { name: detail.opponent.name, count: options.length })
            : t("{name} קבע/ה", { name: detail.opponent.name })}
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
              · {t("מחזור {n}", { n: detail.round_number })}
            </>
          ) : (
            t("ידידותי")
          )}
          {detail.schedule_proposed_at && ` · ${timeAgoLabel(new Date(detail.schedule_proposed_at), t)}`}
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
                      {formatWeekdayDateTime(new Date(option.start_at), t)}
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
            {placeName && <p className="sched-options-court">{placeName}</p>}
          </>
        ) : (
          <div className="sched-hero">
            <div className="sched-hero-time" dir="ltr">
              {formatWeekdayDateTime(scheduledDate, t)}
            </div>
            {placeName && <div className="sched-hero-court">{placeName}</div>}
            <div className="sched-hero-meta" dir="ltr">
              {proposalExpired
                ? "השעה עברה"
                : daysUntilMatch != null && `${t("בעוד")} ${daysUntilMatch} ${daysWord(daysUntilMatch, t)}`}
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
            <p className="sched-expired-note">{t("הזמן שנקבע כבר עבר, קבעו ביניכם זמן חדש")}</p>
          ) : multi && activeOption == null ? (
            <p className="sched-expired-note">{t("אף אחד מהזמנים לא פנוי לך, הצע שעה אחרת")}</p>
          ) : (
            <button
              type="button"
              className="sched-send"
              disabled={busy}
              onClick={() => handleConfirm(false)}
            >
              {multi ? t("מאשר את הזמן שבחרתי") : t("כן, זה מה שסיכמנו")}
            </button>
          )}
          <div className="sched-bottom-row">
            <button
              type="button"
              className="sched-other-link"
              disabled={busy}
              onClick={() => handleDecline(true)}
            >
              {t("לא זה מה שסיכמנו")}
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
        <MatchNav matchId={matchId} unread={detail.unread_messages} t={t} navigate={navigate} />
        <h1 className="sched-title">{t("מול {name}", { name: detail.opponent.name })}</h1>
        {multi ? (
          <div className="sched-options">
            {options.map((option) => (
              <div className="sched-option is-static" key={option.id}>
                <span className="sched-option-time" dir="ltr">
                  {formatWeekdayDateTime(new Date(option.start_at), t)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="sched-hero">
            <div className="sched-hero-time" dir="ltr">
              {formatWeekdayDateTime(scheduledDate, t)}
            </div>
            {placeName && <div className="sched-hero-court">{placeName}</div>}
          </div>
        )}
        {error && <p className="error">{t(error)}</p>}
        <p className="sched-waiting">
          {t("ממתין לאישור של {name}", { name: detail.opponent.name })} ·{" "}
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

  // match-set-180a: before the match there is nothing to report, so the screen
  // is about the arrangement itself — when, who, the details, and calling it
  // off. After the time has passed this is the reporting screen and keeps its
  // own layout, which is also why 180d's cancel isn't offered there: a match
  // that may well have been played gets "המשחק לא בוצע", not a cancellation.
  if (!duePassed && !reporting) {
    return <MatchSet detail={detail} matchId={matchId} me={user?.id} onChanged={reload} />;
  }

  return (
    <div className="sched-page">
      <MatchNav
        label={t(duePassed ? "דיווח התוצאה" : "המשחק קבוע")}
        matchId={matchId}
        unread={detail.unread_messages}
        t={t}
        navigate={navigate}
      />
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
            · {t("מחזור {n}", { n: detail.round_number })}
          </>
        ) : (
          t("ידידותי")
        )}
      </p>

      {error && <p className="error">{t(error)}</p>}

      <div className="sched-hero">
        <div className="sched-hero-time" dir="ltr">
          {formatWeekdayDateTime(scheduledDate, t)}
        </div>
        {placeName && <div className="sched-hero-court">{placeName}</div>}
        <div className="sched-hero-meta" dir="ltr">
          {duePassed
            ? "השעה עברה"
            : daysUntilMatch != null && `${t("בעוד")} ${daysUntilMatch} ${daysWord(daysUntilMatch, t)}`}
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
                  onClick={() => navigate(`/matches/${matchId}/schedule?step=when`)}
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
                onClick={() => navigate(`/matches/${matchId}/schedule?step=when`)}
              >
                {t("שנה את הזמן")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
