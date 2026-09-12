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
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const { reload: reloadOpenAction } = useOpenAction();
  const navigate = useNavigate();

  const [week, setWeek] = useState(null);
  const [leagues, setLeagues] = useState(null);
  const [ratings, setRatings] = useState([]);
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

  const myLevel = ratings.find((r) => r.sport_id === selectedSportId)?.level ?? null;

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
  const leagueTiles = (week?.leagues ?? []).slice(0, 2);
  const extraLeagues = (week?.leagues ?? []).length - leagueTiles.length;
  const round = week?.round ?? null;

  const metaLine = (() => {
    if (!week) return "";
    if (matches.length === 0) return "NO MATCHES THIS WEEK";
    const parts = [
      `${matches.length} ${matches.length === 1 ? "MATCH" : "MATCHES"}`,
    ];
    if (round) {
      const ends = new Date(round.ends_at);
      parts.push(
        `${"ROUND"} ${round.number} ${"ENDS"} ${WEEKDAY[ends.getDay()]} ${dayMonth(ends)}`
      );
    }
    return parts.join(" · ");
  })();

  const compact = matches.length >= 3;

  function cardFor(match) {
    const scheduled = match.scheduled_at ? new Date(match.scheduled_at) : null;
    const dim = match.state === "waiting_on_them" || match.state === "no_time";
    const limeDate = !!scheduled && match.state !== "waiting_on_them";

    // Three cards or more and a full-size button stops fitting: the action
    // becomes a lime line instead (168a's short-card rule).
    const label =
      match.state === "played"
        ? "Report result"
        : match.state === "no_time"
          ? "Propose a time"
          : match.state === "confirm_mine"
            ? "Confirm result"
            : null;
    const target =
      match.state === "no_time"
        ? `/matches/${match.id}/schedule`
        : match.state === "confirm_mine"
          ? `/matches/${match.id}/confirm`
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
          className={`hw-btn ${match.state === "no_time" ? "hw-btn--ghost" : "hw-btn--lime"}`}
          onClick={() => navigate(target)}
        >
          {label}
        </button>
      );
    }

    const route =
      match.state === "waiting_on_them"
        ? `/matches/${match.id}/pending`
        : match.state === "no_time"
          ? `/matches/${match.id}/schedule`
          : `/matches/${match.id}`;

    return (
      <div
        className={`hw-card${compact ? " is-compact" : ""}`}
        key={`m${match.id}`}
        onClick={() => navigate(route)}
      >
        <div className={`hw-date${limeDate ? " is-lime" : ""}`} dir="ltr">
          {scheduled ? (
            <>
              <span className="hw-date-day">{WEEKDAY[scheduled.getDay()]}</span>
              <span className="hw-date-num">{scheduled.getDate()}</span>
              <span className="hw-date-time">{hhmm(scheduled)}</span>
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
          <div className="hw-action" onClick={(e) => e.stopPropagation()}>
            {action}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hw">
      <div className="hw-top">
        <div className="hw-id">
          <span className="hw-name">{user?.name}</span>
          {myLevel != null && (
            <span className="hw-ntrp" dir="ltr">
              {myLevel.toFixed(1)} NTRP
            </span>
          )}
        </div>
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

      <div className="hw-week">
        <h1 className="hw-title">{"THIS WEEK"}</h1>
        <div className="hw-meta" dir="ltr">
          {metaLine}
        </div>
      </div>

      {error && <p className="hw-error error">{t(error)}</p>}

      <div className="hw-diary">
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
                          {"FRIENDLY"}
                          {invite.from_level != null ? ` · ${invite.from_level.toFixed(1)} NTRP` : ""}
                          {` · ${"INVITED YOU"}`}
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

            {leagueTiles.length > 0 && (
              <div className="hw-tiles">
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
                {extraLeagues > 0 && (
                  <button
                    type="button"
                    className="hw-tile hw-tile--more"
                    onClick={() => navigate("/leagues")}
                  >
                    <span className="hw-tile-pos" dir="ltr">
                      +{extraLeagues}
                    </span>
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
