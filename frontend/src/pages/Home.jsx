import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { usePairs } from "../PairContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { useLiveData } from "../liveData.js";
import { BellIcon, PinIcon } from "../Icons.jsx";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import {
  NTRP_STEPS,
  WEEKDAY_SHORT,
  nearestNtrpStep as activeStep,
  acceptFriendlyInvitation,
  calendarDaysUntil as daysUntil,
  dayMonthPadded as dayMonth,
  formatSets,
  monthName,
  weekdayName,
} from "../matchUtils.js";
import Profile from "./Profile.jsx";

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// home-week-168a: the home screen is a diary of the current week — what there
// is to play, when, and the one action each match is asking for.
export default function Home() {
  const { user } = useAuth();
  const { sports, selectedSportId } = useSport();
  // The pair switcher is a lens: this week, in the pair being looked at.
  const { selectedPair, pairLensReady } = usePairs();
  const { t, language } = useLanguage();
  const { reload: reloadOpenAction } = useOpenAction();
  const navigate = useNavigate();

  const [week, setWeek] = useState(null);
  const [leagues, setLeagues] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [stats, setStats] = useState(null);
  const [notifCount, setNotifCount] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!selectedSportId || !pairLensReady) return;
    api
      .homeWeek(selectedSportId, selectedPair?.id)
      .then(setWeek)
      .catch((err) => setError(err.message));
    // The bell counts what needs doing in the sport being looked at, so it
    // agrees with the screen the bell opens — and it is refreshed with the
    // diary, since a notification is the other half of the same news.
    api
      .notifications(selectedSportId, selectedPair?.id)
      .then((data) => setNotifCount(data.unread_count))
      .catch(() => {});
    // The pair is a lens on both, so both wait for it.
  }, [selectedSportId, selectedPair?.id, pairLensReady]);

  useEffect(load, [load]);
  // Somebody else's invitation, or a time they just confirmed, arrives here.
  useLiveData(load);

  useEffect(() => {
    if (!selectedSportId) return;
    api.myStats(selectedSportId).then(setStats).catch(() => {});
  }, [selectedSportId]);

  useEffect(() => {
    if (!pairLensReady) return;
    api.myLeagues(selectedPair?.id).then(setLeagues).catch(() => setLeagues([]));
    api.myRatings().then(setRatings).catch(() => {});
    // Switching pair changes which leagues are mine.
  }, [selectedPair?.id, pairLensReady]);

  const sportLeagues = (leagues ?? []).filter((l) => l.sport.id === selectedSportId);
  const soloLeague = sportLeagues.length === 1 ? sportLeagues[0] : null;

  // A player with no league, or with one league whose schedule hasn't started,
  // gets the dedicated first-day screens (109 / 151c) rather than an empty
  // diary — those still live on the old home component.
  //
  // "Rather than an empty diary" is the whole reason, and the test used to be
  // leagues alone. But homeWeek carries friendlies too — matches and
  // invitations both — so a player whose only tennis is friendly had a full
  // diary and was sent to the old screen anyway, permanently, because a
  // friendly belongs to no league. Ask whether the diary is actually empty.
  //
  // Waiting for `week` as well as `leagues` keeps the old screen from flashing
  // up in the moment before the diary arrives; if it fails to load, Home shows
  // its own error rather than pretending this is day one.
  const weekIsEmpty = !!week && week.matches.length === 0 && week.invites.length === 0;
  if (
    leagues &&
    weekIsEmpty &&
    (sportLeagues.length === 0 || (soloLeague && !soloLeague.schedule_started_at))
  ) {
    return <Profile />;
  }

  const myRating = ratings.find((r) => r.sport_id === selectedSportId) ?? null;

  // In a sport played in pairs, the thing that actually plays is the pair:
  // it joins the league, it has its own number, and the whole screen is
  // already read through the selected pair. So the scale shows the pair's
  // level and keeps the player's own underneath it, rather than showing a
  // personal number that nothing on this screen is about.
  //
  // A pair has no level until both of its members have one (a pair seeded
  // from its rated half would walk into a league under a number that means
  // nothing), and until then the personal scale is the only true one there
  // is — so that is what stays on screen, saying plainly what is missing.
  const lensPair =
    selectedPair && sports.find((s) => s.id === selectedSportId)?.plays_in_pairs
      ? selectedPair
      : null;
  const pairLevelMissing = Boolean(lensPair && lensPair.level == null);
  const scale =
    lensPair && lensPair.level != null
      ? {
          level: lensPair.level,
          label: t("הצמד"),
          provisional: lensPair.provisional,
          // PROVISIONAL_MATCHES on the server. A pair's first three results
          // move it hard, the same way a player's do.
          left: Math.max(0, 3 - lensPair.matches_played),
        }
      : myRating
        ? {
            level: myRating.level,
            label: null,
            provisional: myRating.provisional,
            left: Math.max(0, 3 - myRating.rated_matches),
          }
        : null;
  const sportName = sports.find((s) => s.id === selectedSportId)?.name;
  const winRate =
    stats && stats.matches_played > 0 ? Math.round((stats.wins / stats.matches_played) * 100) : null;

  async function act(id, run) {
    setBusyId(id);
    setError("");
    try {
      await run();
      load();
      reloadOpenAction();
    } catch (err) {
      // Several times were offered and one has to be picked; that choice
      // lives on the match's own screen.
      if (err.status === 409) {
        navigate(`/matches/${id}`);
        return;
      }
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const matches = week?.matches ?? [];
  const invites = week?.invites ?? [];
  // Only the NTRP scale still reads this — it names the league under the
  // bar. The row of league tiles it used to fill is gone.
  const myWeekLeagues = week?.leagues ?? [];
  const round = week?.round ?? null;

  const metaLine = (() => {
    if (!week) return "";
    // 183c: the headline right below says "no matches this week" in full, so
    // the mono row above it is just the period it is talking about.
    if (matches.length === 0) return t("השבוע");
    const parts = [
      t("השבוע"),
      matches.length === 1 ? t("משחק אחד") : t("{n} משחקים", { n: matches.length }),
    ];
    if (round) {
      const ends = new Date(round.ends_at);
      parts.push(
        t("מחזור {n} נסגר {day} {date}", {
          n: round.number,
          day: weekdayName(ends, t),
          date: dayMonth(ends),
        })
      );
    }
    return parts.join(" · ");
  })();

  const emptyState = !!week && matches.length === 0 && invites.length === 0;

  function cardFor(match) {
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

  // home-week-empty-170a: a week with nothing to play isn't one stretched
  // empty card — it's the countdown to the next round, what to do meanwhile,
  // and the last result, with only the last block growing.
  // home-week-empty-183c — a week with nothing in it is not a problem to
  // explain, it is a prompt. The big "days free" number and the paragraph
  // about why the diary is empty are gone; what is left is the state, one
  // action, and the last thing that actually happened.
  function emptyWeek() {
    const nextStart = week?.next_round_starts_at ? new Date(week.next_round_starts_at) : null;
    const days = nextStart ? daysUntil(nextStart) : null;
    const last = week?.last_match ?? null;
    const hasLast = last && (last.opponent_name || (last.my_sets ?? []).length > 0);

    return (
      <>
        <div className="hwe-head">
          <div className="hwe-head-text">
            <h2 className="hwe-title">
              {t("אין משחקים השבוע")}
            </h2>
            {days !== null && (
              <div className="hwe-next">
                {days === 0
                  ? t("המחזור הבא מתחיל היום")
                  : days === 1
                    ? t("המחזור הבא מתחיל מחר")
                    : t("המחזור הבא מתחיל ב-{day} {date}", {
                        day: weekdayName(nextStart, t),
                        date: dayMonth(nextStart),
                      })}
              </div>
            )}
          </div>
          <button type="button" className="hwe-go" onClick={() => navigate("/new-match")}>
            {t("קבע משחק")}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Pinned to the bottom of the diary, against the leagues bar. A player
            with no history at all has nothing to pin, and gets nothing. */}
        {hasLast && (
          <div className="hwe-last">
            <div className="hwe-last-top" dir="ltr">
              <span className="hwe-last-label">
                {t("המשחק האחרון")}
                {last.round ? ` · ${t("מחזור {n}", { n: last.round })}` : ""}
              </span>
              <span className="hwe-last-rule" />
              <span className={`hwe-last-result${last.won ? " won" : ""}`}>
                {last.won ? t("ניצחון") : t("הפסד")}
              </span>
            </div>
            <div className="hwe-last-score" dir="ltr">
              {formatSets(last.my_sets)}
            </div>
            <div className="hwe-last-name">
              {`${t("מול")} `}
              <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                {last.opponent_name}
              </span>
            </div>
            <div className="hwe-last-sub">
              {last.played_at && (
                <>
                  {weekdayName(new Date(last.played_at), t)} {dayMonth(new Date(last.played_at))}
                </>
              )}
              {last.league_name && (
                <>
                  {last.played_at ? " · " : ""}
                  <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                    {last.league_name}
                  </span>
                </>
              )}
              {last.ntrp_delta != null &&
                ` · NTRP ${last.ntrp_delta > 0 ? "+" : "−"}${Math.abs(last.ntrp_delta).toFixed(1)}`}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="hw">
      <div className="hw-hero">
        <div className="hw-top">
          <span className="hw-name">{user?.name}</span>
          <div className="hw-top-side">
            <span className="hw-leagues">
              {sportLeagues.length === 1 ? t("ליגה אחת") : t("{n} ליגות", { n: sportLeagues.length })}
            </span>
            <button
              type="button"
              className="hw-bell"
              onClick={() => navigate("/notifications")}
              aria-label={t("התראות")}
            >
              <BellIcon aria-hidden="true" />
              {notifCount > 0 && <span className="hw-bell-dot" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="hw-nums" dir="ltr">
          <span className="hw-num">
            <span dir="ltr">{winRate !== null ? winRate : "–"}%</span>
            <span className="hw-num-unit">{t("ניצחונות")}</span>
          </span>
          {/* The W/L letters only work inside an English run — in Hebrew the
              letters and the digits fight over the order, so the record is
              just the two numbers. */}
          <span className="hw-num" dir="ltr">
            {language === "en"
              ? `${stats ? stats.wins : 0}W-${stats ? stats.losses : 0}L`
              : `${stats ? stats.wins : 0}-${stats ? stats.losses : 0}`}
          </span>
          <span className="hw-num">
            {t("{n} שוחקו", { n: stats ? stats.matches_played : 0 })}
          </span>
        </div>

        {scale && (
          <div className="hw-scale">
            <div className="hw-scale-head">
              <span className="hw-scale-label">
                NTRP · {sportName ? t(sportName) : ""}
                {scale.label ? ` · ${scale.label}` : ""}
              </span>
              <span className="hw-scale-level" dir="ltr">
                {scale.level.toFixed(1)}
              </span>
            </div>
            <div className="hw-scale-bar" dir="ltr" aria-hidden="true">
              {NTRP_STEPS.map((step) => (
                <span
                  key={step}
                  className={`hw-step${step === activeStep(scale.level) ? " is-here" : ""}`}
                />
              ))}
            </div>
            <div className="hw-scale-foot" dir="ltr">
              <span>1.5</span>
              <span className="hw-scale-note" dir="auto">
                {scale.provisional
                  ? scale.left === 1
                    ? t("זמני · עוד משחק אחד")
                    : t("זמני · עוד {n} משחקים", { n: scale.left })
                  : (round && myWeekLeagues[0]?.name) || ""}
              </span>
              <span>7.0</span>
            </div>
            {/* The personal number is not dropped, only moved below the one
                the screen is about — and it leads to the pair's page, where
                both players' levels sit beside the pair's. */}
            {lensPair && (myRating || pairLevelMissing) && (
              <Link to={`/pairs/${lensPair.id}`} className="hw-scale-mine">
                {pairLevelMissing
                  ? t("לצמד עוד אין רמה")
                  : t("הרמה שלך: {level}", { level: myRating.level.toFixed(1) })}
              </Link>
            )}
          </div>
        )}
      </div>

      {error && <p className="hw-error error">{t(error)}</p>}

      {/* One card used to share the diary's height with the strip of league
          tiles below it. With the strip gone a single match stretched down the
          whole screen, so a lone card keeps its own height instead of growing
          into the space. Two or more still divide it. */}
      <div
        className={`hw-diary${emptyState ? " hw-diary--empty" : ""}${
          matches.length === 1 && invites.length === 0 ? " hw-diary--one" : ""
        }`}
      >
        <div className="hw-meta" dir="ltr">
          {metaLine}
        </div>
        {!week ? (
          <SkeletonMatchRow />
        ) : (
          <>
            {matches.length > 0 ? matches.map(cardFor) : invites.length === 0 ? emptyWeek() : null}

            {invites.length > 0 && (
              <div className="hw-invites">
                <div className="hw-sec" dir="ltr">
                  <span className="hw-sec-name">{t("הזמנות למשחק ידידותי")}</span>
                  <span className="hw-sec-rule" />
                  <span className="hw-sec-count">{invites.length}</span>
                </div>
                {invites.slice(0, 2).map((invite) => {
                  const when = invite.proposed_at ? new Date(invite.proposed_at) : null;
                  return (
                    <div className="hw-card hw-card--invite" key={`i${invite.id}`}>
                      <div className="hw-date" dir="ltr">
                        {when ? (
                          <>
                            <span className="hw-date-day">{weekdayName(when, t)}</span>
                            <span className="hw-date-num">{when.getDate()}</span>
                            <span className="hw-date-time">{hhmm(when)}</span>
                          </>
                        ) : (
                          <>
                            <span className="hw-date-num">?</span>
                            <span className="hw-date-time">{t("אין תאריך")}</span>
                          </>
                        )}
                      </div>
                      <div className="hw-body">
                        <span className="hw-opponent">{invite.from_name}</span>
                        <span className="hw-sub">
                          {`${t("משחק ידידותי")} · ${t("הזמין/ה אותך")}`}
                        </span>
                        <div className="hw-action hw-action--pair">
                          <button
                            type="button"
                            className="hw-btn hw-btn--lime hw-btn--sm"
                            disabled={busyId === invite.id}
                            onClick={() => act(invite.id, () => acceptFriendlyInvitation(api, { id: invite.id, scheduled_at: invite.proposed_at }))}
                          >
                            {t("אשר")}
                          </button>
                          <button
                            type="button"
                            className="hw-btn hw-btn--ghost hw-btn--sm"
                            disabled={busyId === invite.id}
                            onClick={() => act(invite.id, () => api.declineFriendlyInvite(invite.id))}
                          >
                            {t("דחה")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {invites.length > 2 && (
                  <button type="button" className="hw-more" onClick={() => navigate("/invites")}>
                    {t("עוד {n} הזמנות", { n: invites.length - 2 })}
                  </button>
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
