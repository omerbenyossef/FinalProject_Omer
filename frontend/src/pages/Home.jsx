import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { usePairs } from "../PairContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useLiveData } from "../liveData.js";
import { CheckIcon } from "../Icons.jsx";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import { dayMonthPadded as dayMonth, weekdayName } from "../matchUtils.js";
import Profile from "./Profile.jsx";

/* 214 — the home screen answers one question: what is next for me.

   What it replaces had grown into a magazine: a court photograph, a
   carousel of other people's games, a feed of other people's results, a
   greeting with a streak in it. All of it was true and none of it was the
   answer — the one thing the reader came for was somewhere in the middle of
   it, in a card that looked like all the others.

   So: the next match, the one thing the app is waiting on from this player,
   and three numbers. Nothing on this screen is a picture. */

const WEEK_MS = 7 * 86400000;

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function Home() {
  const { user } = useAuth();
  const { sports, selectedSportId } = useSport();
  // The pair switcher is a lens: everything here is read through it.
  const { selectedPair, pairLensReady } = usePairs();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [week, setWeek] = useState(null);
  const [matches, setMatches] = useState(null);
  const [leagues, setLeagues] = useState(null);
  const [openGames, setOpenGames] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!selectedSportId || !pairLensReady) return;
    api
      .homeWeek(selectedSportId, selectedPair?.id)
      .then(setWeek)
      .catch((err) => setError(err.message));
    // Every match of mine, not just this week's: the task this screen names
    // can be a round that is about to close, and the week's answer drops it.
    api
      .myMatches(selectedSportId, selectedPair?.id)
      .then(setMatches)
      .catch(() => setMatches([]));
    // Somebody else's offer is not read through my pair lens.
    api
      .openGames(selectedSportId)
      .then((games) => setOpenGames(games.filter((g) => !g.mine && !g.joined && !g.blocked_reason)))
      .catch(() => setOpenGames([]));
  }, [selectedSportId, selectedPair?.id, pairLensReady]);

  useEffect(load, [load]);
  // A time somebody just proposed is the task this screen is about.
  useLiveData(load);

  useEffect(() => {
    if (!pairLensReady) return;
    api.myLeagues(selectedPair?.id).then(setLeagues).catch(() => setLeagues([]));
    api.myRatings().then(setRatings).catch(() => {});
    // Switching pair changes which leagues are mine.
  }, [selectedPair?.id, pairLensReady]);

  const sportLeagues = (leagues ?? []).filter((l) => l.sport.id === selectedSportId);
  const soloLeague = sportLeagues.length === 1 ? sportLeagues[0] : null;

  // A player with no league, or with one whose schedule hasn't started, gets
  // the dedicated first-day screens rather than a home screen with nothing to
  // answer. Those still live on the old component.
  const nothingYet = !!week && week.matches.length === 0 && week.invites.length === 0;
  if (
    leagues &&
    nothingYet &&
    (sportLeagues.length === 0 || (soloLeague && !soloLeague.schedule_started_at))
  ) {
    return <Profile />;
  }

  const rows = matches ?? [];
  const now = Date.now();

  // The soonest match with an agreed time still ahead of it.
  const nextMatch = rows
    .filter((m) => m.scheduled_at && new Date(m.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];

  // The one thing the app is waiting on, in the order the spec puts them.
  // First match wins, and there is never more than one: a screen that lists
  // every outstanding thing is the screen this one replaces.
  const task = (() => {
    // Not in the spec's table, and first all the same: an invitation is the
    // only task somebody else is actively waiting on, and it was on the old
    // home screen. Dropping it would mean a player whose friend just invited
    // them opens the app and is told everything is fine.
    const invite = (week?.invites ?? [])[0];
    if (invite)
      return {
        title: t("{name} הזמין/ה אותך למשחק", { name: invite.from_name }),
        line: invite.proposed_at
          ? `${weekdayName(new Date(invite.proposed_at), t)} ${dayMonth(
              new Date(invite.proposed_at)
            )} · ${hhmm(new Date(invite.proposed_at))}`
          : t("משחק ידידותי"),
        action: t("לתשובה"),
        to: "/invites",
      };
    const played = rows.find((m) => m.state === "played");
    if (played)
      return {
        title: t("דווח את התוצאה"),
        line: t("מול {name}", { name: played.opponent_name }),
        action: t("דווח תוצאה"),
        to: `/matches/${played.id}`,
      };
    const confirm = rows.find((m) => m.state === "confirm_mine");
    if (confirm)
      return {
        title: t("אשר את התוצאה"),
        line: t("מול {name}", { name: confirm.opponent_name }),
        action: t("אשר תוצאה"),
        to: `/matches/${confirm.id}/confirm`,
      };
    const proposed = rows.find((m) => m.state === "time_from_them");
    if (proposed)
      return {
        title: t("{name} הציע/ה שעה", { name: proposed.opponent_name }),
        line: proposed.scheduled_at
          ? `${weekdayName(new Date(proposed.scheduled_at), t)} ${dayMonth(
              new Date(proposed.scheduled_at)
            )} · ${hhmm(new Date(proposed.scheduled_at))}`
          : proposed.league_name || t("ידידותי"),
        action: t("הגב"),
        to: `/matches/${proposed.id}`,
      };
    // A match with no date at all, in a round that is open: the one whose
    // round closes first, because that is the one that is about to be lost.
    const toSchedule = rows
      .filter(
        (m) =>
          m.state === "no_time" &&
          (!m.round_starts_at || new Date(m.round_starts_at).getTime() <= now) &&
          (!m.round_ends_at || new Date(m.round_ends_at).getTime() > now)
      )
      .sort(
        (a, b) =>
          new Date(a.round_ends_at ?? 8640000000000000) -
          new Date(b.round_ends_at ?? 8640000000000000)
      )[0];
    if (toSchedule)
      return {
        title: t("קבעו זמן למשחק"),
        line: [
          toSchedule.round ? t("מחזור {n}", { n: toSchedule.round }) : null,
          t("מול {name}", { name: toSchedule.opponent_name }),
          toSchedule.round_ends_at
            ? t("נסגר {day} {date}", {
                day: weekdayName(new Date(toSchedule.round_ends_at), t),
                date: dayMonth(new Date(toSchedule.round_ends_at)),
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        action: t("קבעו זמן"),
        to: `/matches/${toSchedule.id}`,
      };
    return null;
  })();

  const gamesThisWeek = openGames.filter(
    (g) => new Date(g.starts_at).getTime() - now < WEEK_MS
  ).length;

  // In a pairs sport the number that matters is the pair's: it is the thing
  // that enters a league and carries a rating.
  const lensPair =
    selectedPair && sports.find((s) => s.id === selectedSportId)?.plays_in_pairs
      ? selectedPair
      : null;
  const myRating = ratings.find((r) => r.sport_id === selectedSportId) ?? null;
  const level = lensPair?.level ?? myRating?.level ?? null;

  // Best place across the leagues being played now. One number, because the
  // tile has room for one.
  const place = (week?.leagues ?? [])
    .map((l) => l.position)
    .filter((p) => p != null)
    .sort((a, b) => a - b)[0];

  const toSchedule = rows.filter(
    (m) =>
      m.state === "no_time" &&
      (!m.round_ends_at || new Date(m.round_ends_at).getTime() > now) &&
      (!m.round_starts_at || new Date(m.round_starts_at).getTime() <= now)
  ).length;

  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12
      ? t("בוקר טוב, {name}")
      : hour >= 12 && hour < 17
        ? t("צהריים טובים, {name}")
        : t("ערב טוב, {name}");

  // With nothing owed, the card says so and offers the one thing worth doing
  // next — in the order that is most likely to end in a game being played.
  const allSet = (() => {
    if (gamesThisWeek > 0)
      return { label: t("מצא משחק"), to: "/games?tab=open" };
    if (nextMatch) return { label: t("צפה במשחק"), to: `/matches/${nextMatch.id}` };
    return { label: t("הצטרף לליגה"), to: "/leagues/open" };
  })();

  return (
    <div className="hm">
      <h1 className="hm-hello" dir="auto">
        {greeting.replace("{name}", (user?.name || "").trim().split(" ")[0])}
      </h1>

      {error && <p className="hm-error error">{t(error)}</p>}

      {matches == null ? (
        <SkeletonMatchRow />
      ) : (
        <>
          {/* The next match always has its place on this screen, whether or
              not anything is owed — and when there isn't one, the screen says
              so in as many words rather than leaving the slot empty. */}
          {nextMatch ? (
            <section className="hm-glow">
              <span className="hm-label">{t("המשחק הבא שלך")}</span>
              <div className="hm-row">
                <div className="hm-col">
                  <span className="hm-when" dir="auto">
                    {`${weekdayName(new Date(nextMatch.scheduled_at), t)} ${dayMonth(
                      new Date(nextMatch.scheduled_at)
                    )} · ${hhmm(new Date(nextMatch.scheduled_at))}`}
                  </span>
                  <span className="hm-sub" dir="auto">
                    {[t("מול {name}", { name: nextMatch.opponent_name }), nextMatch.place]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <button
                  type="button"
                  className="hm-go"
                  onClick={() => navigate(`/matches/${nextMatch.id}`)}
                >
                  {t("צפה במשחק")}
                </button>
              </div>
            </section>
          ) : (
            <section className="hm-plain hm-none">
              <span className="hm-label hm-label--muted">{t("המשחק הבא שלך")}</span>
              <div className="hm-row">
                <div className="hm-col">
                  <span className="hm-task" dir="auto">
                    {t("אין כרגע משחק קבוע באופק")}
                  </span>
                  {/* With a task open, the card under this one says what to do
                      about it; two buttons for one thing is one too many. */}
                  <span className="hm-sub" dir="auto">
                    {task ? t("הצעד הבא יביא אותך לשם") : t("אף משחק לא נקבע לשעה")}
                  </span>
                </div>
                {!task && (
                  <button type="button" className="hm-outline" onClick={() => navigate(allSet.to)}>
                    {allSet.label}
                  </button>
                )}
              </div>
            </section>
          )}

          {task ? (
            <section className="hm-plain">
              <span className="hm-label">{t("הצעד הבא")}</span>
              <div className="hm-row">
                <div className="hm-col">
                  <span className="hm-task" dir="auto">
                    {task.title}
                  </span>
                  <span className="hm-sub" dir="auto">
                    {task.line}
                  </span>
                </div>
                <button type="button" className="hm-outline" onClick={() => navigate(task.to)}>
                  {task.action}
                </button>
              </div>
            </section>
          ) : (
            nextMatch && (
              /* The match above is the loud card, so "nothing owed" is a line,
                 not a second hero. */
              <section className="hm-clear">
                <span className="hm-check" aria-hidden="true">
                  <CheckIcon />
                </span>
                <span className="hm-clear-text">{t("הכל מסודר")}</span>
              </section>
            )
          )}
        </>
      )}

      <div className="hm-stats">
        <div className="hm-stat">
          <span className="hm-stat-value" dir="ltr">
            {week ? week.win_streak : "–"}
          </span>
          <span className="hm-stat-label">{t("ניצחונות רצופים")}</span>
        </div>
        <div className="hm-stat">
          <span className="hm-stat-value" dir="ltr">
            {level != null ? level.toFixed(1) : "–"}
          </span>
          <span className="hm-stat-label">NTRP</span>
        </div>
        {place != null && (
          <div className="hm-stat">
            <span className="hm-stat-value" dir="ltr">
              {`#${place}`}
            </span>
            <span className="hm-stat-label">{t("בליגה שלך")}</span>
          </div>
        )}
      </div>

      <div className="hm-tiles">
        <button type="button" className="hm-tile" onClick={() => navigate("/games?tab=open")}>
          <span className="hm-tile-title">{t("הצטרף לאירוע")}</span>
          <span className="hm-tile-sub">
            {gamesThisWeek === 0
              ? t("אין כרגע אירועים לידך")
              : gamesThisWeek === 1
                ? t("אירוע אחד לידך השבוע")
                : t("{n} אירועים לידך השבוע", { n: gamesThisWeek })}
          </span>
          <span className="hm-tile-arrow" aria-hidden="true">
            ↗
          </span>
        </button>
        <button type="button" className="hm-tile" onClick={() => navigate("/games?tab=leagues")}>
          <span className="hm-tile-title">{t("הליגות שלי")}</span>
          <span className="hm-tile-sub">
            {[
              sportLeagues.length === 1
                ? t("ליגה אחת")
                : t("{n} ליגות", { n: sportLeagues.length }),
              toSchedule === 0
                ? t("הכל מתואם")
                : toSchedule === 1
                  ? t("משחק אחד לתאם")
                  : t("{n} משחקים לתאם", { n: toSchedule }),
            ].join(" · ")}
          </span>
          <span className="hm-tile-arrow" aria-hidden="true">
            ↗
          </span>
        </button>
      </div>
    </div>
  );
}
