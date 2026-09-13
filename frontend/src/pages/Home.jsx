import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { BellIcon } from "../Icons.jsx";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import { NTRP_STEPS, formatSets } from "../matchUtils.js";
import Profile from "./Profile.jsx";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

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
  const { t } = useLanguage();
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
  if (leagues && (sportLeagues.length === 0 || (soloLeague && !soloLeague.schedule_started_at))) {
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
    if (matches.length === 0) return "THIS WEEK · NO MATCHES";
    const parts = [
      "THIS WEEK",
      `${matches.length} ${matches.length === 1 ? "MATCH" : "MATCHES"}`,
    ];
    if (round) {
      const ends = new Date(round.ends_at);
      parts.push(`R${round.number} ${"ENDS"} ${WEEKDAY[ends.getDay()]} ${dayMonth(ends)}`);
    }
    return parts.join(" · ");
  })();

  const compact = matches.length >= 3;
  const emptyState = !!week && matches.length === 0 && invites.length === 0;

  function cardFor(match) {
    const scheduled = match.scheduled_at ? new Date(match.scheduled_at) : null;
    const voided = match.state === "not_played";
    const dim = match.state === "waiting_on_them" || match.state === "no_time" || voided;
    const limeDate = !!scheduled && !voided && match.state !== "waiting_on_them";

    // Three cards or more and a full-size button stops fitting: the action
    // becomes a lime line instead (168a's short-card rule).
    const label =
      match.state === "played"
        ? "Report result"
        : match.state === "no_time"
          ? "Propose a time"
          : match.state === "confirm_mine"
            ? "Confirm result"
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
          {match.state === "waiting_on_them" ? "WAITING FOR THEM" : "ALL SET"}
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

    const route = voided
      ? `/matches/${match.id}/reschedule`
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
              <span className="hw-date-day">{WEEKDAY[scheduled.getDay()]}</span>
              <span className="hw-date-num">{scheduled.getDate()}</span>
              <span className="hw-date-time">{voided ? "NOT PLAYED" : hhmm(scheduled)}</span>
            </>
          ) : (
            <>
              <span className="hw-date-num">?</span>
              <span className="hw-date-time">{"NO DATE"}</span>
            </>
          )}
        </div>
        <div className="hw-body">
          <span className={`hw-opponent${dim ? " dim" : ""}`}>{match.opponent_name}</span>
          <span className="hw-sub" dir="ltr">
            {match.league_name ? (
              <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                {match.league_name}
              </span>
            ) : (
              "FRIENDLY"
            )}
            {match.round ? ` · R${match.round}` : ""}
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
              <span className="hw-free-label">{days === 1 ? "DAY FREE" : "DAYS FREE"}</span>
              <span className="hw-free-sub">
                {days === 0
                  ? "NEXT ROUND STARTS TODAY"
                  : days === 1
                    ? "NEXT ROUND STARTS TOMORROW"
                    : `NEXT ROUND STARTS ${WEEKDAY[nextStart.getDay()]} ${dayMonth(nextStart)}`}
              </span>
            </span>
          </div>
        )}

        <p className="hw-explain">
          {days !== null
            ? "All your league matches are played. New fixtures show up here when the next round starts."
            : "All your league matches are played. New fixtures show up here when your league opens its next round."}
        </p>

        <div className="hw-cta-stack">
          <button type="button" className="hw-cta" onClick={() => navigate("/friendly/new")}>
            <span className="hw-cta-text">
              <span className="hw-cta-title">{"Find a friendly match"}</span>
              {near > 0 && week?.my_level != null && (
                <span className="hw-cta-sub" dir="ltr">
                  {`${near} PLAYERS NEAR ${week.my_level.toFixed(1)}`}
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
            <span className="hw-cta-title">{"Browse open leagues"}</span>
            <span className="hw-cta-chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>

        {last ? (
          <div className="hw-last">
            <div className="hw-last-top" dir="ltr">
              <span className="hw-last-label">
                {"LAST MATCH"}
                {last.round ? ` · R${last.round}` : ""}
              </span>
              <span className="hw-last-rule" />
              <span className={`hw-last-result${last.won ? " won" : ""}`}>
                {last.won ? "WON" : "LOST"}
              </span>
            </div>
            <div className="hw-last-mid">
              <span className="hw-last-name">
                {"vs "}
                <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                  {last.opponent_name}
                </span>
              </span>
              <span className="hw-last-score" dir="ltr">
                {formatSets(last.my_sets)}
              </span>
            </div>
            <div className="hw-last-sub" dir="ltr">
              {last.played_at && (
                <>
                  {WEEKDAY[new Date(last.played_at).getDay()]} {dayMonth(new Date(last.played_at))}
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
            <span className="hw-last-empty">{"NO MATCHES PLAYED YET"}</span>
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
            <span className="hw-leagues" dir="ltr">
              {sportLeagues.length} {sportLeagues.length === 1 ? "LEAGUE" : "LEAGUES"}
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
            {winRate !== null ? winRate : "–"}%<span className="hw-num-unit">{"WIN"}</span>
          </span>
          <span className="hw-num">
            {stats ? stats.wins : 0}W-{stats ? stats.losses : 0}L
          </span>
          <span className="hw-num">
            {stats ? stats.matches_played : 0} {"PLAYED"}
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
                  <span className="hw-sec-name">{"FRIENDLY INVITES"}</span>
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
                            <span className="hw-date-day">{WEEKDAY[when.getDay()]}</span>
                            <span className="hw-date-num">{when.getDate()}</span>
                            <span className="hw-date-time">{hhmm(when)}</span>
                          </>
                        ) : (
                          <>
                            <span className="hw-date-num">?</span>
                            <span className="hw-date-time">{"NO DATE"}</span>
                          </>
                        )}
                      </div>
                      <div className="hw-body">
                        <span className="hw-opponent">{invite.from_name}</span>
                        <span className="hw-sub" dir="ltr">
                          {`FRIENDLY · ${"INVITED YOU"}`}
                        </span>
                        <div className="hw-action hw-action--pair">
                          <button
                            type="button"
                            className="hw-btn hw-btn--lime hw-btn--sm"
                            disabled={busyId === invite.id}
                            onClick={() => act(invite.id, () => api.acceptFriendlyInvite(invite.id))}
                          >
                            {"Accept"}
                          </button>
                          <button
                            type="button"
                            className="hw-btn hw-btn--ghost hw-btn--sm"
                            disabled={busyId === invite.id}
                            onClick={() => act(invite.id, () => api.declineFriendlyInvite(invite.id))}
                          >
                            {"Decline"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {invites.length > 2 && (
                  <button type="button" className="hw-more" onClick={() => navigate("/invites")}>
                    {`+${invites.length - 2} more invites`}
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
              {"Join a league"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
