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
import { monthName, weekdayName } from "../matchUtils.js";

/* 214 — the home screen answers one question: what is next for me.

   What it replaces had grown into a magazine: a court photograph, a
   carousel of other people's games, a feed of other people's results, a
   greeting with a streak in it. All of it was true and none of it was the
   answer — the one thing the reader came for was somewhere in the middle of
   it, in a card that looked like all the others.

   So: the next match, the one thing the app is waiting on from this player,
   and three numbers. Nothing on this screen is a picture. */

const WEEK_MS = 7 * 86400000;

// The shared weekday and month labels are stored upper case for the screens
// that set them in mono; nothing on this one is in caps.
function sentenceCase(label) {
  const text = String(label ?? "");
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// "Thu 26 Nov". The numeric form (26.11) read as a version number next to a
// time, and the month written out never needs working out.
function dayDate(date, t) {
  return `${sentenceCase(weekdayName(date, t))} ${date.getDate()} ${sentenceCase(
    monthName(date, t)
  )}`;
}

// Padel cards name four people, and four full names do not fit a row.
function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

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

  // There used to be a second home screen here, for a player with no league
  // or one that hasn't started: a day counter, an NTRP bar and four ways to
  // begin. One screen now answers for everybody — it says there is no match
  // ahead and nothing owed, and the tiles under it lead to the games and the
  // leagues, which is where starting actually happens.

  const rows = matches ?? [];
  const now = Date.now();
  // Padel is 2 vs 2: the same screen, with four names on the cards instead of
  // one. Everything else — the task ladder, the stats, the tiles — is shared.
  const isPairs = !!sports.find((s) => s.id === selectedSportId)?.plays_in_pairs;

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
          ? `${dayDate(new Date(invite.proposed_at), t)} · ${hhmm(
              new Date(invite.proposed_at)
            )}`
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
        match: played,
      };
    const confirm = rows.find((m) => m.state === "confirm_mine");
    if (confirm)
      return {
        title: t("אשר את התוצאה"),
        line: t("מול {name}", { name: confirm.opponent_name }),
        action: t("אשר תוצאה"),
        to: `/matches/${confirm.id}/confirm`,
        match: confirm,
      };
    const proposed = rows.find((m) => m.state === "time_from_them");
    if (proposed)
      return {
        title: t("{name} הציע/ה שעה", { name: proposed.opponent_name }),
        line: proposed.scheduled_at
          ? `${dayDate(new Date(proposed.scheduled_at), t)} · ${hhmm(
              new Date(proposed.scheduled_at)
            )}`
          : proposed.league_name || t("ידידותי"),
        action: t("הגב"),
        to: `/matches/${proposed.id}`,
        match: proposed,
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
          toSchedule.round ? sentenceCase(t("מחזור {n}", { n: toSchedule.round })) : null,
          // In pairs the four names are a line of their own above this one.
          isPairs ? null : t("מול {name}", { name: toSchedule.opponent_name }),
          toSchedule.round_ends_at
            ? t("נסגר {day} {date}", {
                day: sentenceCase(weekdayName(new Date(toSchedule.round_ends_at), t)),
                date: `${new Date(toSchedule.round_ends_at).getDate()} ${sentenceCase(
                  monthName(new Date(toSchedule.round_ends_at), t)
                )}`,
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        action: t("קבעו זמן"),
        to: `/matches/${toSchedule.id}`,
        match: toSchedule,
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

  // A match in a round that has already closed never reaches the task ladder
  // above — the ladder only offers to arrange a time while there is still a
  // round to play it in. It is still unfinished business, though, and it has
  // its own screen, so "nothing is waiting on you" would be a lie while any
  // of these exist.
  const stale = rows.filter(
    (m) =>
      !["played", "confirm_mine", "waiting_on_them", "not_played"].includes(m.state) &&
      m.round_ends_at &&
      new Date(m.round_ends_at).getTime() < now &&
      // A match with a time still ahead of it is being played, late round or
      // not — it is the card at the top of this screen, not leftover business.
      !(m.scheduled_at && new Date(m.scheduled_at).getTime() >= now)
  ).length;

  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12
      ? t("בוקר טוב, {name}")
      : hour >= 12 && hour < 17
        ? t("צהריים טובים, {name}")
        : t("ערב טוב, {name}");

  // The four names, as the two cards want them: stacked in the match card,
  // on one line in the next-step card. A missing partner is a question mark
  // with a way to answer it, not a blank.
  const them = (match) => (match.opponent_names ?? []).map(firstName).filter(Boolean);
  const partner = (match) => firstName(match.partner_name);
  const isolate = (name) => (
    <span dir="auto" style={{ unicodeBidi: "isolate" }}>
      {name}
    </span>
  );

  function playersBox(match) {
    const mate = partner(match);
    const facing = them(match);
    return (
      <div className="hm-players" dir="ltr">
        <span className="hm-players-side">
          <b>{t("את/ה")}</b>
          {mate ? (
            <b>{isolate(mate)}</b>
          ) : (
            <b className="hm-players-none">
              ?
              <button type="button" className="hm-pick" onClick={() => navigate("/partners")}>
                {t("בחירת פרטנר")}
              </button>
            </b>
          )}
        </span>
        <span className="hm-players-vs">vs</span>
        <span className="hm-players-side hm-players-side--end">
          {(facing.length ? facing : [match.opponent_name]).map((name, i) => (
            <i key={i}>{isolate(name)}</i>
          ))}
        </span>
      </div>
    );
  }

  function playersLine(match) {
    const mate = partner(match);
    const facing = them(match);
    return (
      <span className="hm-pairline" dir="ltr">
        {t("את/ה")}
        {" & "}
        {mate ? isolate(mate) : "?"}
        <em>vs</em>
        {(facing.length ? facing : [match.opponent_name]).map((name, i) => (
          <span key={i}>
            {i > 0 && " & "}
            {isolate(name)}
          </span>
        ))}
      </span>
    );
  }

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
            isPairs ? (
              <section className="hm-glow hm-glow--pair">
                <span className="hm-label">{t("המשחק הבא שלך")}</span>
                <span className="hm-when" dir="auto">
                  {`${dayDate(new Date(nextMatch.scheduled_at), t)} · ${hhmm(
                    new Date(nextMatch.scheduled_at)
                  )}`}
                </span>
                {playersBox(nextMatch)}
                <div className="hm-row">
                  <span className="hm-venue" dir="auto">
                    {nextMatch.place}
                  </span>
                  <button
                    type="button"
                    className="hm-go hm-go--sm"
                    onClick={() => navigate(`/matches/${nextMatch.id}`)}
                  >
                    {t("צפה במשחק")}
                  </button>
                </div>
              </section>
            ) : (
              <section className="hm-glow">
                <span className="hm-label">{t("המשחק הבא שלך")}</span>
                <div className="hm-row">
                  <div className="hm-col">
                    <span className="hm-when" dir="auto">
                      {`${dayDate(new Date(nextMatch.scheduled_at), t)} · ${hhmm(
                        new Date(nextMatch.scheduled_at)
                      )}`}
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
            )
          ) : (
            <section className="hm-plain hm-none">
              <span className="hm-label hm-label--muted">{t("המשחק הבא שלך")}</span>
              <div className="hm-row">
                <div className="hm-col">
                  <span className="hm-task" dir="auto">
                    {t("אין כרגע משחק קבוע באופק")}
                  </span>
                  {/* No button: this card is a statement, not an offer. The
                      action, when there is one, is on the card below, and
                      somebody already in leagues reads "join a league" as the
                      app having lost track of them. */}
                  <span className="hm-sub" dir="auto">
                    {task || stale > 0
                      ? t("הצעד הבא יביא אותך לשם")
                      : t("אף משחק לא נקבע לשעה")}
                  </span>
                </div>
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
                  {isPairs && task.match && playersLine(task.match)}
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
            /* Both slots keep their place: the screen should read the same
               whether or not there is anything to do, and "nothing" is an
               answer worth saying out loud. */
            <section className="hm-plain hm-none">
              <span className="hm-label hm-label--muted">{t("הצעד הבא")}</span>
              <div className="hm-row">
                <div className="hm-col">
                  <span className="hm-task" dir="auto">
                    {stale === 0
                      ? t("הכל מסודר")
                      : stale === 1
                        ? t("משחק אחד מהעבר בלי תוצאה")
                        : t("{n} משחקים מהעבר בלי תוצאה", { n: stale })}
                  </span>
                  <span className="hm-sub" dir="auto">
                    {stale === 0
                      ? t("אין משחק שמחכה לתיאום או לדיווח")
                      : t("דווחו מה קרה — תוצאה, או שהמשחק לא בוצע")}
                  </span>
                </div>
                {stale === 0 ? (
                  <span className="hm-check" aria-hidden="true">
                    <CheckIcon />
                  </span>
                ) : (
                  <button type="button" className="hm-outline" onClick={() => navigate("/needs-you")}>
                    {t("דווח")}
                  </button>
                )}
              </div>
            </section>
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
