import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { BellIcon } from "../Icons.jsx";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import Profile from "./Profile.jsx";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// home-week-169a: nine steps, 1.5 to 5.5 — the range an amateur league lives
// in. Anything outside it sits on the nearest edge rather than off the bar.
const HW_STEPS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5];

function activeStep(level) {
  if (level == null) return null;
  let best = HW_STEPS[0];
  for (const step of HW_STEPS) {
    if (Math.abs(step - level) < Math.abs(best - level)) best = step;
  }
  return best;
}

function dayMonth(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
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
              {HW_STEPS.map((step) => (
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
                  ? t("זמני · עוד {n} משחקים", { n: 3 - myRating.rated_matches })
                  : (round && leagueTiles[0]?.name) || ""}
              </span>
              <span>5.5</span>
            </div>
          </div>
        )}
      </div>

      {error && <p className="hw-error error">{t(error)}</p>}

      <div className="hw-diary">
        <div className="hw-meta" dir="ltr">
          {metaLine}
        </div>
        {!week ? (
          <SkeletonMatchRow />
        ) : (
          <>
            {matches.length > 0 ? (
              matches.map(cardFor)
            ) : invites.length === 0 ? (
              <div className="hw-empty">
                <span className="hw-empty-line">
                  {round
                    ? t("מחזור {n} ממשיך", { n: round.number })
                    : t("אין משחקים פתוחים")}
                </span>
                <button
                  type="button"
                  className="hw-btn hw-btn--ghost"
                  onClick={() => navigate("/friendly/new")}
                >
                  {"Find a friendly match"}
                </button>
              </div>
            ) : null}

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
