import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { BellIcon } from "../Icons.jsx";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import {
  NTRP_STEPS,
  WEEKDAY_SHORT,
  acceptFriendlyInvitation,
  formatSets,
  monthName,
  weekdayName,
} from "../matchUtils.js";
import Profile from "./Profile.jsx";

// The scale runs the app's full NTRP range, 1.5 to 7. A level between steps
// (or outside the range) sits on the nearest one rather than off the bar.
function activeStep(level) {
  if (level == null) return null;
  let best = NTRP_STEPS[0];
  for (const step of NTRP_STEPS) {
    if (Math.abs(step - level) < Math.abs(best - level)) best = step;
  }
  return best;
}

function dayMonth(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(date) {
  return Math.max(0, Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000));
}

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// home-week-168a: the home screen is a diary of the current week — what there
// is to play, when, and the one action each match is asking for.
export default function Home() {
  const { user } = useAuth();
  const { sports, selectedSportId } = useSport();
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
    if (!selectedSportId) return;
    api
      .homeWeek(selectedSportId)
      .then(setWeek)
      .catch((err) => setError(err.message));
  }, [selectedSportId]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!selectedSportId) return;
    api.myStats(selectedSportId).then(setStats).catch(() => {});
  }, [selectedSportId]);

  useEffect(() => {
    api.myLeagues().then(setLeagues).catch(() => setLeagues([]));
    api.myRatings().then(setRatings).catch(() => {});
    api
      .notifications()
      .then((data) => setNotifCount(data.unread_count))
      .catch(() => {});
  }, []);

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
  const leagueTiles = week?.leagues ?? [];
  const round = week?.round ?? null;

  const metaLine = (() => {
    if (!week) return "";
    if (matches.length === 0) return `${t("השבוע")} · ${t("אין משחקים")}`;
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

  const compact = matches.length >= 3;
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
    const unsettled = sentInvite || timeFromMe || timeFromThem;
    const dim =
      match.state === "waiting_on_them" || match.state === "no_time" || voided || sentInvite || timeFromMe;
    const limeDate = !!scheduled && !voided && !unsettled && match.state !== "waiting_on_them";

    // Three cards or more and a full-size button stops fitting: the action
    // becomes a lime line instead (168a's short-card rule).
    const label =
      match.state === "played"
        ? t("דווח תוצאה")
        : match.state === "no_time"
          ? t("הצע שעה")
          : timeFromThem
            ? t("אשר את השעה")
            : match.state === "confirm_mine"
              ? t("אשר תוצאה")
              : voided
                ? t("תיאום במחזור אחר")
                : null;
    const target =
      match.state === "no_time"
        ? `/matches/${match.id}/schedule`
        : match.state === "confirm_mine"
          ? `/matches/${match.id}/confirm`
          : voided
            ? `/matches/${match.id}/reschedule`
            : `/matches/${match.id}`;

    let action;
    if (!label) {
      action = (
        <span className="hw-mono-action">
          {sentInvite
            ? t("מחכה שיאשרו את ההזמנה")
            : timeFromMe
              ? t("מחכה שיאשרו את השעה")
              : match.state === "waiting_on_them"
                ? t("מחכה לתשובה שלו")
                : t("הכול מוכן")}
        </span>
      );
    } else if (compact) {
      action = (
        <button type="button" className="hw-text-action" onClick={() => navigate(target)}>
          {label}
        </button>
      );
    } else {
      action = (
        <button
          type="button"
          className={`hw-btn ${match.state === "no_time" || voided ? "hw-btn--ghost" : "hw-btn--lime"}`}
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
          : match.state === "no_time"
            ? `/matches/${match.id}/schedule`
            : `/matches/${match.id}`;

    return (
      <div
        className={`hw-card${compact ? " is-compact" : ""}${voided ? " hw-card--void" : ""}`}
        key={`m${match.id}`}
        onClick={() => navigate(route)}
      >
        <div className={`hw-date${limeDate ? " is-lime" : ""}`} dir="ltr">
          {scheduled ? (
            <>
              <span className="hw-date-day">{weekdayName(scheduled, t)}</span>
              <span className="hw-date-num">{scheduled.getDate()}</span>
              <span className="hw-date-time">{voided ? t("לא שוחק") : hhmm(scheduled)}</span>
            </>
          ) : (
            <>
              <span className="hw-date-num">?</span>
              <span className="hw-date-time">{t("אין תאריך")}</span>
            </>
          )}
        </div>
        <div className="hw-body">
          <span className="hw-who">
            <Avatar name={match.opponent_name} photoUrl={match.opponent_photo_url} size={30} />
            <span className={`hw-opponent${dim ? " dim" : ""}`}>{match.opponent_name}</span>
          </span>
          <span className="hw-sub">
            {match.league_name ? (
              <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                {match.league_name}
              </span>
            ) : (
              t("משחק ידידותי")
            )}
            {match.round ? ` · ${t("מחזור {n}", { n: match.round })}` : ""}
          </span>
          {voided && match.note && <span className="hw-note">{t(match.note)}</span>}
          <div className="hw-action" onClick={(e) => e.stopPropagation()}>
            {action}
          </div>
        </div>
      </div>
    );
  }

  // home-week-empty-170a: a week with nothing to play isn't one stretched
  // empty card — it's the countdown to the next round, what to do meanwhile,
  // and the last result, with only the last block growing.
  function emptyWeek() {
    const nextStart = week?.next_round_starts_at ? new Date(week.next_round_starts_at) : null;
    const days = nextStart ? daysUntil(nextStart) : null;
    const last = week?.last_match ?? null;
    const near = week?.players_near_level ?? 0;

    return (
      <>
        {days !== null && (
          <div className="hw-free" dir="ltr">
            <span className="hw-free-num">{days}</span>
            <span className="hw-free-side">
              <span className="hw-free-label">{days === 1 ? t("יום פנוי") : t("ימים פנויים")}</span>
              <span className="hw-free-sub">
                {days === 0
                  ? t("המחזור הבא מתחיל היום")
                  : days === 1
                    ? t("המחזור הבא מתחיל מחר")
                    : t("המחזור הבא מתחיל ב-{day} {date}", {
                        day: weekdayName(nextStart, t),
                        date: dayMonth(nextStart),
                      })}
              </span>
            </span>
          </div>
        )}

        <p className="hw-explain">
          {days !== null
            ? t("כל משחקי הליגה שלך שוחקו. משחקים חדשים יופיעו כאן כשייפתח המחזור הבא.")
            : t("כל משחקי הליגה שלך שוחקו. משחקים חדשים יופיעו כאן כשהליגה תפתח מחזור חדש.")}
        </p>

        <div className="hw-cta-stack">
          <button type="button" className="hw-cta" onClick={() => navigate("/friendly/new")}>
            <span className="hw-cta-text">
              <span className="hw-cta-title">{t("מצא משחק ידידותי")}</span>
              {near > 0 && week?.my_level != null && (
                <span className="hw-cta-sub">
                  {near === 1
                    ? t("שחקן אחד ברמה {level}", { level: week.my_level.toFixed(1) })
                    : t("{n} שחקנים ברמה {level}", { n: near, level: week.my_level.toFixed(1) })}
                </span>
              )}
            </span>
            <span className="hw-cta-go" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className="hw-cta hw-cta--ghost"
            onClick={() => navigate("/leagues/open")}
          >
            <span className="hw-cta-title">{t("עיין בליגות פתוחות")}</span>
            <span className="hw-cta-chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>

        {last && (last.opponent_name || (last.my_sets ?? []).length > 0) ? (
          <div className="hw-last">
            <div className="hw-last-top" dir="ltr">
              <span className="hw-last-label">
                {t("המשחק האחרון")}
                {last.round ? ` · ${t("מחזור {n}", { n: last.round })}` : ""}
              </span>
              <span className="hw-last-rule" />
              <span className={`hw-last-result${last.won ? " won" : ""}`}>
                {last.won ? t("ניצחון") : t("הפסד")}
              </span>
            </div>
            <div className="hw-last-mid">
              <span className="hw-last-name">
                {`${t("מול")} `}
                <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                  {last.opponent_name}
                </span>
              </span>
              <span className="hw-last-score" dir="ltr">
                {formatSets(last.my_sets)}
              </span>
            </div>
            <div className="hw-last-sub">
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
        ) : (
          <div className="hw-last hw-last--none">
            <span className="hw-last-empty">{t("עוד לא שיחקת משחקים")}</span>
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

        {myRating && (
          <div className="hw-scale">
            <div className="hw-scale-head">
              <span className="hw-scale-label">NTRP · {sportName ? t(sportName) : ""}</span>
              <span className="hw-scale-level" dir="ltr">
                {myRating.level.toFixed(1)}
              </span>
            </div>
            <div className="hw-scale-bar" dir="ltr" aria-hidden="true">
              {NTRP_STEPS.map((step) => (
                <span
                  key={step}
                  className={`hw-step${step === activeStep(myRating.level) ? " is-here" : ""}`}
                />
              ))}
            </div>
            <div className="hw-scale-foot" dir="ltr">
              <span>1.5</span>
              <span className="hw-scale-note" dir="auto">
                {myRating.provisional
                  ? 3 - myRating.rated_matches === 1
                    ? t("זמני · עוד משחק אחד")
                    : t("זמני · עוד {n} משחקים", { n: 3 - myRating.rated_matches })
                  : (round && leagueTiles[0]?.name) || ""}
              </span>
              <span>7.0</span>
            </div>
          </div>
        )}
      </div>

      {error && <p className="hw-error error">{t(error)}</p>}

      <div className={`hw-diary${emptyState ? " hw-diary--empty" : ""}`}>
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

      {week && (
        <div className="hw-strip">
          <div className="hw-strip-inner">
            {leagueTiles.map((league) => (
              <button
                type="button"
                className="hw-tile"
                key={league.id}
                onClick={() => navigate(`/leagues/${league.id}`)}
              >
                <span className="hw-tile-name">{league.name}</span>
                <span className="hw-tile-pos" dir="ltr">
                  {league.position ?? "–"}
                  <span className="hw-tile-size">/{league.size ?? "–"}</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              className="hw-tile hw-tile--join"
              onClick={() => navigate("/leagues/open")}
            >
              {t("הצטרף לליגה")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
