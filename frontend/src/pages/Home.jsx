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
import { tintColor, tintFor } from "../tint.js";
import CourtImage from "../CourtImage.jsx";
import ActivityFeed from "../ActivityFeed.jsx";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import {
  NTRP_STEPS,
  nearestNtrpStep as activeStep,
  acceptFriendlyInvitation,
  calendarDaysUntil as daysUntil,
  dayMonthPadded as dayMonth,
  formatSets,
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
  const { t } = useLanguage();
  const { reload: reloadOpenAction } = useOpenAction();
  const navigate = useNavigate();

  const [week, setWeek] = useState(null);
  const [leagues, setLeagues] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  // 203b — the two things on the screen that are about other people.
  const [openGames, setOpenGames] = useState([]);
  const [feed, setFeed] = useState([]);
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
    // 203b — other people's games and other people's news. Neither is read
    // through the pair lens: an open game is somebody else's offer and the
    // feed is the neighbourhood, and filtering either by which of my pairs I
    // am looking through would empty them for no reason anybody could see.
    api
      .openGames(selectedSportId)
      .then((games) => setOpenGames(games.filter((g) => !g.is_full && !g.joined)))
      .catch(() => setOpenGames([]));
    api.activity(selectedSportId, 5).then(setFeed).catch(() => setFeed([]));
    // The pair is a lens on both, so both wait for it.
  }, [selectedSportId, selectedPair?.id, pairLensReady]);

  useEffect(load, [load]);
  // Somebody else's invitation, or a time they just confirmed, arrives here.
  useLiveData(load);


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
  // What a match is asking its player to do, if anything. Shared, because
  // the big card at the top and the small cards under it must never disagree
  // about whether something is waiting — the top one used to offer only
  // "details" while the card for the same match downstairs said "confirm the
  // result".
  function askOf(match) {
    const scheduled = match.scheduled_at ? new Date(match.scheduled_at) : null;
    const voided = match.state === "not_played";
    const timeFromMe = match.state === "time_from_me";
    const timeFromThem = match.state === "time_from_them";
    const staleProposal =
      (timeFromMe || timeFromThem) && !!scheduled && scheduled.getTime() < Date.now();
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
    return { label, target, staleProposal, voided };
  }

  // 203b — the greeting. The time of day is the phone's, not the server's:
  // it is the reader's evening that the word is about.
  const hello = (() => {
    const hour = new Date().getHours();
    const key =
      hour >= 5 && hour < 12
        ? "בוקר טוב, {name}"
        : hour >= 12 && hour < 17
          ? "צהריים טובים, {name}"
          : "ערב טוב, {name}";
    return t(key, { name: (user?.name || "").trim().split(" ")[0] });
  })();

  // The line under it, in the order the spec puts them: a streak is the best
  // thing there is to say, then how busy the week is, then the prompt.
  const helloSub = (() => {
    if (!week) return "";
    const count = week.matches_this_week ?? 0;
    const busy =
      count === 1 ? t("משחק אחד השבוע") : count > 1 ? t("{n} משחקים השבוע", { n: count }) : null;
    if ((week.win_streak ?? 0) >= 2) {
      const streak = t("{n} ניצחונות ברצף", { n: week.win_streak });
      return (
        <>
          <span className="ha-streak">{streak}</span> 🔥{busy ? ` · ${busy}` : ""}
        </>
      );
    }
    if (busy) return busy;
    return t("אין עוד משחקים השבוע. אפשר למצוא אחד למטה");
  })();

  // The soonest match, which gets the picture and the faces. Everything else
  // this week keeps the 199b card underneath it.
  const next = matches[0] ?? null;
  const rest = matches.slice(1);

  function nextCard(match) {
    const ask = askOf(match);
    const scheduled = match.scheduled_at ? new Date(match.scheduled_at) : null;
    const days = scheduled ? daysUntil(scheduled) : null;
    const when = !scheduled
      ? t("אין תאריך")
      : days === 0
        ? `${t("היום")} · ${hhmm(scheduled)}`
        : days === 1
          ? `${t("מחר")} · ${hhmm(scheduled)}`
          : `${weekdayName(scheduled, t)} ${dayMonth(scheduled)} · ${hhmm(scheduled)}`;

    // The context line: which competition this is, and whether these two
    // have met before. "You won last time" is the whole reason the card
    // feels like a rivalry rather than an appointment.
    const meeting = match.last_meeting;
    const history = !meeting
      ? match.opponent_id
        ? t("פעם ראשונה שאתם משחקים")
        : null
      : meeting.won === true
        ? `${t("ניצחת בפעם הקודמת")} 🏆`
        : meeting.won === false
          ? t("הפסדת בפעם הקודמת")
          : null;
    const competition = match.league_name
      ? match.round
        ? `${t("מחזור {n}", { n: match.round })} · ${match.league_name}`
        : match.league_name
      : t("ידידותי");

    return (
      <article className="ha-next" onClick={() => navigate(`/matches/${match.id}`)}>
        <CourtImage
          photoUrl={match.venue?.image_url}
          surface={match.venue?.surface}
          height={96}
          className="ha-next-court"
        >
          <span className="ha-next-chip" dir="auto">
            {when}
          </span>
          {match.place && (
            <bdi className="ha-next-place">{match.place}</bdi>
          )}
        </CourtImage>

        <div className="ha-next-body">
          <span className="ha-next-faces" aria-hidden="true">
            <Avatar
              name={user?.name}
              photoUrl={user?.photo_url}
              size={38}
              background={tintColor(user?.name || "")}
              color="#0e1116"
            />
            <Avatar
              name={match.opponent_name}
              photoUrl={match.opponent_photo_url}
              size={38}
              background={tintColor(match.opponent_name)}
              color="#0e1116"
            />
          </span>
          <div className="ha-next-text">
            <span className="ha-next-title">
              {`${t("מול")} `}
              <bdi>{match.opponent_name}</bdi>
            </span>
            <span className="ha-next-ctx" dir="auto">
              {[competition, history].filter(Boolean).join(" · ")}
            </span>
          </div>
          {/* The button is "details" only when the match is asking for
              nothing. When something is waiting, the biggest thing on the
              screen says what it is. */}
          <button
            type="button"
            className={`ha-next-btn${ask.label ? " is-ask" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(ask.label ? ask.target : `/matches/${match.id}`);
            }}
          >
            {ask.label ?? t("פרטים")}
          </button>
        </div>
      </article>
    );
  }

  // Nothing lined up. Not the same thing as the empty week further down: this
  // is the card that stands where the next match would be.
  function noNextCard() {
    return (
      <article className="ha-cta">
        <span className="ha-cta-title">{t("אין משחק מתוכנן")}</span>
        <div className="ha-cta-btns">
          <button type="button" className="ha-cta-go" onClick={() => navigate("/new-match")}>
            {t("מצא משחק")}
          </button>
          <button type="button" className="ha-cta-alt" onClick={() => navigate("/friendly/new")}>
            {t("הזמן חבר")}
          </button>
        </div>
      </article>
    );
  }

  function openGameCard(game) {
    const at = new Date(game.starts_at);
    const spots =
      game.seats_left === 1
        ? t("מקום אחד פנוי")
        : t("{n} מקומות פנויים", { n: game.seats_left });
    return (
      <article className="ha-og" key={`g${game.id}`} onClick={() => navigate("/games/open")}>
        <CourtImage
          photoUrl={game.venue_image_url}
          surface={game.venue_surface}
          height={70}
          className="ha-og-court"
        />
        <div className="ha-og-body">
          <span className="ha-og-when" dir="auto">
            {`${weekdayName(at, t)} ${hhmm(at)}`}
          </span>
          <span className="ha-og-where" dir="auto">
            {[game.where, game.is_doubles ? t("זוגות") : t("יחידים")].filter(Boolean).join(" · ")}
          </span>
          <div className="ha-og-foot">
            <span className="ha-og-faces" aria-hidden="true">
              {game.players.slice(0, 3).map((person) => (
                <Avatar
                  key={person.id}
                  name={person.name}
                  photoUrl={person.photo_url}
                  size={26}
                  background={tintColor(person.name)}
                  color="#0e1116"
                />
              ))}
              {/* One dashed circle per seat still open — the card says what it
                  is missing rather than how full it is. */}
              {Array.from({ length: Math.min(game.seats_left, 3) }).map((_, i) => (
                <span className="ha-og-open" key={`o${i}`}>
                  +
                </span>
              ))}
            </span>
            <span className="ha-og-spots">{spots}</span>
          </div>
        </div>
      </article>
    );
  }

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
    // What the card offers to do about it — the same answer the big card at
    // the top of the screen gets, from the same place.
    const { label, target } = askOf(match);

    // 199b — the card is tinted with the opponent's own colour, so a week of
    // matches looks like a week of different people. What used to be said by
    // one card being lime is said by a chip on every card instead: there is
    // always a state, and it is never the grey "all set" that told nobody
    // anything.
    const tint = tintFor(match.opponent_name);
    const confirmed = !!scheduled && !unsettled && !voided;

    const waitingFor = sentInvite
      ? t("מחכה שיאשרו את ההזמנה")
      : timeFromMe
        ? t("מחכה שיאשרו את השעה")
        : match.state === "waiting_on_them"
          ? t("מחכה לתשובה שלו")
          : null;

    // The chip on the left of the bottom row. Amber when the clock has run
    // out on us, accent when everything is agreed, grey when the ball is in
    // somebody else's court.
    const chip =
      match.state === "played" || match.state === "confirm_mine"
        ? { tone: "amber", text: t("ממתין לתוצאה"), dot: true }
        : waitingFor
          ? { tone: "quiet", text: waitingFor }
          : confirmed
            ? { tone: "accent", text: t("מאושר"), check: true }
            : null;

    // The line it gives way to when there is no chip to show: what the card
    // is waiting on, rather than a blank.
    const note = voided && match.note
      ? t(match.note)
      : !scheduled
        ? match.league_name && round
          ? t("המחזור נסגר {day} {date}", {
              day: weekdayName(new Date(round.ends_at), t),
              date: dayMonth(new Date(round.ends_at)),
            })
          : t("עוד אין תאריך")
        : null;

    const action = label ? (
      <button type="button" className="mc-btn" onClick={() => navigate(target)}>
        {label}
      </button>
    ) : null;

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
        className={`mc${voided ? " mc--void" : ""}`}
        key={`m${match.id}`}
        onClick={() => navigate(route)}
        style={{ "--tint": tint }}
      >
        <div className="mc-top">
          <div className="mc-who">
            <span className="mc-face" aria-hidden="true">
              {(match.opponent_name || "?").trim()[0]}
            </span>
            <div className="mc-who-text">
              <span className="mc-vs">{t("מול")}</span>
              <span className="mc-name" dir="auto">
                {match.opponent_name}
              </span>
              {/* Mono with letter-spacing is for Latin labels only: tracking
                  a Hebrew word pulls it apart into ה ל ו ז ר י ם. Names keep
                  their own face, case and direction. */}
              <span className="mc-meta">
                <span className="mc-meta-label">
                  {match.league_name
                    ? match.round
                      ? t("מחזור {n}", { n: match.round })
                      : t("ליגה")
                    : t("ידידותי")}
                </span>
                {match.league_name && (
                  <span className="mc-meta-name" dir="auto">
                    {` · ${match.league_name}`}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* A clock and a date are a Latin run whichever way the page
              reads: "--:--" under RTL came out as scattered dashes. */}
          <div className="mc-when" dir="ltr">
            {scheduled ? (
              <>
                <span className="mc-when-big">{voided ? "—" : hhmm(scheduled)}</span>
                <span className="mc-when-date">
                  {`${weekdayName(scheduled, t)} ${dayMonth(scheduled)}`}
                </span>
              </>
            ) : (
              <>
                <span className="mc-when-big mc-when-big--none">--:--</span>
                <span className="mc-when-date mc-when-date--none">{t("אין תאריך")}</span>
              </>
            )}
          </div>
        </div>

        <div className="mc-foot">
          {chip ? (
            <span className={`mc-chip mc-chip--${chip.tone}`}>
              {chip.dot && <i className="mc-chip-dot" aria-hidden="true" />}
              {chip.check && (
                <svg className="mc-chip-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <polyline
                    points="5 12.5 10 17.5 19 7"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {chip.text}
            </span>
          ) : (
            <span className="mc-note">{note}</span>
          )}

          {action ? (
            <span className="mc-action" onClick={(e) => e.stopPropagation()}>
              {action}
            </span>
          ) : (
            /* The venue, and only ever the venue: the match's own court or
               the venue it was booked at. When there is none the line is not
               there at all — nothing else is allowed to stand in for it. */
            match.place && (
              <span className="mc-place">
                <PinIcon aria-hidden="true" />
                <bdi className="mc-place-name">{match.place}</bdi>
              </span>
            )
          )}
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
        {/* 203b — the headline and the button this block used to open with
            are gone: the card at the top of the screen already says there is
            nothing on and offers the two ways out of that, and saying it
            twice on one screen made the screen look stuck. What is left is
            the one thing nothing else says — the last result, and the one
            line that is not on it: when there will be something to play. */}
        {days !== null && (
          <p className="ha-quiet">
            {days === 0
              ? t("המחזור הבא מתחיל היום")
              : days === 1
                ? t("המחזור הבא מתחיל מחר")
                : t("המחזור הבא מתחיל ב-{day} {date}", {
                    day: weekdayName(nextStart, t),
                    date: dayMonth(nextStart),
                  })}
          </p>
        )}
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

  // 203b — a feed with almost nothing in it is worse than a short one: it
  // reads as a broken section rather than a quiet week. One honest filler
  // line, not a page of invented activity.
  const feedItems = feed.length > 0 && feed.length < 3
    ? [...feed, { id: 0, type: "invite_friend", payload: {}, people: [], count: 0 }]
    : feed;

  return (
    <div className="ha">
      <header className="ha-greet">
        <div className="ha-greet-text">
          <h1 className="ha-hello" dir="auto">
            {hello} 👋
          </h1>
          <p className="ha-sub" dir="auto">
            {helloSub}
          </p>
        </div>
        {/* The bell's dot is warm red rather than the sport's accent: the
            accent is everywhere on this screen and says "this is yours", and
            this one thing has to say "this is new". */}
        <button
          type="button"
          className="ha-bell"
          onClick={() => navigate("/notifications")}
          aria-label={t("התראות")}
        >
          <BellIcon aria-hidden="true" />
          {notifCount > 0 && <span className="ha-bell-dot" aria-hidden="true" />}
        </button>
      </header>

      {error && <p className="hw-error error">{t(error)}</p>}

      {!week ? <SkeletonMatchRow /> : next ? nextCard(next) : noNextCard()}

      {invites.length > 0 && (
        <section className="ha-sec">
          <div className="ha-sec-head">
            <h2 className="ha-sec-title">{t("הזמנות למשחק ידידותי")}</h2>
            {invites.length > 2 && (
              <button type="button" className="ha-sec-link" onClick={() => navigate("/invites")}>
                {t("עוד {n} הזמנות", { n: invites.length - 2 })}
              </button>
            )}
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
                      onClick={() =>
                        act(invite.id, () =>
                          acceptFriendlyInvitation(api, {
                            id: invite.id,
                            scheduled_at: invite.proposed_at,
                          })
                        )
                      }
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
        </section>
      )}

      {/* The NTRP scale is not in the 203b spec, which is all about other
          people. It stays because it is the one number the player asked to
          see here — in a pairs sport it is the pair's, which is the thing
          that actually enters a league — only moved below the match, where
          the screen now starts. */}
      {scale && (
        <div className="ha-card ha-scale">
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
            {lensPair && (myRating || pairLevelMissing) && (
              <Link to={`/pairs/${lensPair.id}`} className="hw-scale-mine">
                {pairLevelMissing
                  ? t("לצמד עוד אין רמה")
                  : t("הרמה שלך: {level}", { level: myRating.level.toFixed(1) })}
              </Link>
            )}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <section className="ha-sec">
          <div className="ha-sec-head">
            <h2 className="ha-sec-title">{t("גם השבוע")}</h2>
            {round && (
              <span className="ha-sec-note" dir="auto">
                {t("מחזור {n}", { n: round.number })}
              </span>
            )}
          </div>
          <div className="ha-rest">{rest.map(cardFor)}</div>
        </section>
      )}

      {/* The week with nothing in it keeps its countdown and its last
          result — the CTA card above says what to do, these say where the
          player stands. */}
      {week && matches.length === 0 && invites.length === 0 && (
        <section className="ha-sec ha-sec--empty">{emptyWeek()}</section>
      )}

      {openGames.length > 0 && (
        <section className="ha-sec">
          <div className="ha-sec-head">
            <h2 className="ha-sec-title">{t("אירועים לידך")}</h2>
            <Link to="/games/open" className="ha-sec-link">
              {`${t("הכל")} ${openGames.length}`}
            </Link>
          </div>
          {/* Bleeds off the end of the screen on purpose: a row of cards that
              stops neatly at the gutter looks like all there is. */}
          <div className="ha-rail">{openGames.slice(0, 8).map(openGameCard)}</div>
        </section>
      )}

      <section className="ha-sec">
        <div className="ha-sec-head">
          <h2 className="ha-sec-title">{t("מה קורה סביבך")}</h2>
        </div>
        {feedItems.length > 0 ? (
          <ActivityFeed items={feedItems} />
        ) : (
          <p className="ha-quiet">{t("עוד שקט סביבך")}</p>
        )}
      </section>
    </div>
  );
}
