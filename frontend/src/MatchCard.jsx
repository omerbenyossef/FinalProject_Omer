import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar.jsx";
import { PinIcon } from "./Icons.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import {
  calendarDaysUntil as daysUntil,
  dayMonthPadded as dayMonth,
  weekdayName,
} from "./matchUtils.js";

/* 198c — one match, as a card.
   It lives outside the home screen because the games hub shows the same
   thing: a player who taps "Matches" is looking for their own matches, and
   a second, lighter version of this card there would have been a second
   answer to the same question. */

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function MatchCard({ match }) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const scheduled = match.scheduled_at ? new Date(match.scheduled_at) : null;
  const voided = match.state === "not_played";
  // An invitation I sent reads like anything else I'm waiting on: the time
  // is only a proposal until they answer, so it isn't lime yet.
  const sentInvite = match.state === "invite_sent";
  // A time one side put forward and the other hasn't agreed to yet.
  const timeFromMe = match.state === "time_from_me";
  const timeFromThem = match.state === "time_from_them";
  // A proposed time that has already gone by. There is nothing to confirm —
  // the server refuses a past time — so the card must not keep asking.
  // Friendlies are swept away entirely; a league match still has to be
  // played, so it goes back to arranging one.
  const staleProposal =
    (timeFromMe || timeFromThem) && !!scheduled && scheduled.getTime() < Date.now();
  const unsettled = sentInvite || timeFromMe || timeFromThem;
  // 198c replaced the lime date column and the dimmed name with the two
  // card states below, so neither flag is read any more.
  const label =
    match.state === "played"
      ? t("דווח תוצאה")
      : staleProposal
        ? t("הזמן עבר · קבעו זמן חדש")
      : match.state === "no_time"
        ? t("קבעו זמן")
        : timeFromThem
          ? t("אשר את השעה")
          : match.state === "confirm_mine"
            ? t("אשר תוצאה")
            : voided
              ? t("תיאום במחזור אחר")
              : null;
  const target =
    match.state === "no_time" || staleProposal
      ? `/matches/${match.id}`
      : match.state === "confirm_mine"
        ? `/matches/${match.id}/confirm`
        : voided
          ? `/matches/${match.id}/reschedule`
          : `/matches/${match.id}`;

  // 198c — two states, and which one a card is in.
  //
  // Glowing means "this one is yours to move": a result to report or
  // confirm, a time to approve, or a match close enough that looking at it
  // is the point. Everything else — no time yet, waiting on them, a match
  // next week — is quiet, so the glow keeps meaning something.
  const HOURS_48 = 48 * 60 * 60 * 1000;
  const soon =
    !!scheduled && !voided && !unsettled &&
    scheduled.getTime() - Date.now() <= HOURS_48 &&
    scheduled.getTime() >= Date.now();
  const myMove =
    match.state === "played" || match.state === "confirm_mine" || timeFromThem;
  const needsAction = !voided && (myMove || soon);

  // The one line above the name, when there is something to say about
  // timing. "Awaiting result" outranks the day, because a match whose time
  // has gone is no longer about when it is.
  const pill = !needsAction
    ? null
    : match.state === "played" || match.state === "confirm_mine"
      ? t("ממתין לתוצאה")
      : soon
        ? daysUntil(scheduled) <= 0
          ? t("היום")
          : t("מחר")
        : null;

  let action;
  if (!label && soon) {
    // Nothing to do yet, but it is today or tomorrow: the card is already
    // glowing, so it ends in a way in rather than in "all set".
    action = (
      <button
        type="button"
        className="mc-btn mc-btn--primary"
        onClick={() => navigate(target)}
      >
        {t("לצפייה במשחק")}
      </button>
    );
  } else if (!label) {
    action = (
      <span className="mc-wait">
        {sentInvite
          ? t("מחכה שיאשרו את ההזמנה")
          : timeFromMe
            ? t("מחכה שיאשרו את השעה")
            : match.state === "waiting_on_them"
              ? t("מחכה לתשובה שלו")
              : t("הכול מוכן")}
      </span>
    );
  } else {
    action = (
      <button
        type="button"
        className={`mc-btn ${needsAction ? "mc-btn--primary" : "mc-btn--ghost"}`}
        onClick={() => navigate(target)}
      >
        {label}
      </button>
    );
  }

  // Where a sent invitation can be re-timed or withdrawn.
  const route = voided
    ? `/matches/${match.id}/reschedule`
    : timeFromMe
      // Their screen to answer; this one shows what was offered.
      ? `/matches/${match.id}`
      : sentInvite
        ? "/needs-you"
      : match.state === "waiting_on_them"
        ? `/matches/${match.id}/pending`
        : `/matches/${match.id}`;

  return (
    <div
      className={`mc${needsAction ? "" : " is-quiet"}${voided ? " mc--void" : ""}`}
      key={`m${match.id}`}
      onClick={() => navigate(route)}
    >
      {needsAction && <span className="mc-glow" aria-hidden="true" />}

      <div className="mc-top">
        {scheduled ? (
          <div className="mc-date">
            {/* Latin labels keep the mono face and its tracking; the day
                and the clock are digits, so they are safe there too. */}
            <span className="mc-date-day">{weekdayName(scheduled, t)}</span>
            <span className="mc-date-time">
              {voided ? "—" : hhmm(scheduled)}
            </span>
            <span className="mc-date-dm">{dayMonth(scheduled)}</span>
          </div>
        ) : (
          <div className="mc-date mc-date--none">
            <span className="mc-date-q">?</span>
            <span className="mc-date-no">{t("אין תאריך")}</span>
          </div>
        )}

        <div className="mc-info">
          {pill && (
            <span className="mc-pill">
              <i className="mc-pill-dot" aria-hidden="true" />
              {pill}
            </span>
          )}

          <span className="mc-who">
            <Avatar name={match.opponent_name} photoUrl={match.opponent_photo_url} size={24} />
            <span className="mc-name" dir="auto">
              {match.opponent_name}
            </span>
          </span>

          {/* 198c's typography rule. Mono with letter-spacing is for Latin
              labels only: tracking a Hebrew word pulls its letters apart
              into ה ל ו ז ר י ם, because Hebrew has no spacing between
              letters to widen. Names — the league's, the partner's, the
              venue's — are sans with no tracking and their own direction. */}
          <span className="mc-meta">
            <span className="mc-meta-label">
              {match.league_name
                ? match.round
                  ? t("מחזור {n}", { n: match.round })
                  : t("ליגה")
                : t("ידידותי")}
            </span>
            {match.league_name && (
              <>
                <span className="mc-meta-sep" aria-hidden="true">·</span>
                <span className="mc-meta-name" dir="auto">
                  {match.league_name}
                </span>
              </>
            )}
            {match.partner_name && (
              <>
                <span className="mc-meta-sep" aria-hidden="true">·</span>
                <span className="mc-meta-name" dir="auto">
                  {t("עם {name}", { name: match.partner_name })}
                </span>
              </>
            )}
          </span>

          {match.place && (
            <span className="mc-place">
              <PinIcon aria-hidden="true" />
              <bdi className="mc-place-name">{match.place}</bdi>
            </span>
          )}

          {voided && match.note && <span className="mc-note">{t(match.note)}</span>}
        </div>
      </div>

      <div className="mc-action" onClick={(e) => e.stopPropagation()}>
        {action}
      </div>
    </div>
  );
}
