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
import { tintColor } from "../tint.js";
import CourtImage from "../CourtImage.jsx";
import ActivityFeed from "../ActivityFeed.jsx";
import { SkeletonMatchRow } from "../Skeleton.jsx";
import {
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
  const { selectedSportId } = useSport();
  // The pair switcher is a lens: this week, in the pair being looked at.
  const { selectedPair, pairLensReady } = usePairs();
  const { t } = useLanguage();
  const { reload: reloadOpenAction } = useOpenAction();
  const navigate = useNavigate();

  const [week, setWeek] = useState(null);
  const [leagues, setLeagues] = useState(null);
  // 203b — the two things on the screen that are about other people.
  const [openGames, setOpenGames] = useState([]);
  const [feed, setFeed] = useState([]);
  // What a thin feed is padded with. Both are facts about the player's own
  // surroundings, fetched once per sport rather than per render.
  const [nearby, setNearby] = useState(null);
  const [venues, setVenues] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!selectedSportId || !pairLensReady) return;
    api
      .homeWeek(selectedSportId, selectedPair?.id)
      .then(setWeek)
      .catch((err) => setError(err.message));
    // 203b — other people's games and other people's news. Neither is read
    // through the pair lens: an open game is somebody else's offer and the
    // feed is the neighbourhood, and filtering either by which of my pairs I
    // am looking through would empty them for no reason anybody could see.
    api
      .openGames(selectedSportId)
      .then((games) => setOpenGames(games.filter((g) => !g.is_full && !g.joined)))
      .catch(() => setOpenGames([]));
    api.activity(selectedSportId, 5).then(setFeed).catch(() => setFeed([]));
    api.playersNearMe(selectedSportId).then(setNearby).catch(() => setNearby(null));
    api.venues(selectedSportId).then(setVenues).catch(() => setVenues([]));
    // The pair is a lens on both, so both wait for it.
  }, [selectedSportId, selectedPair?.id, pairLensReady]);

  useEffect(load, [load]);
  // Somebody else's invitation, or a time they just confirmed, arrives here.
  useLiveData(load);


  useEffect(() => {
    if (!pairLensReady) return;
    api.myLeagues(selectedPair?.id).then(setLeagues).catch(() => setLeagues([]));
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

  // The soonest match, and the only one on this screen. The rest of the
  // week's matches live on the Play tab now (205a): a home screen that
  // listed them all was the diary this one replaces.
  const next = matches[0] ?? null;

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

  // 203b — a feed with almost nothing in it reads as a broken section
  // rather than a quiet week, so it is padded to three. The fillers are
  // facts about the player's own surroundings and each one leads somewhere;
  // none of them invents activity that did not happen.
  const feedItems = (() => {
    const items = [...feed];
    if (items.length >= 3) return items;
    const filler = [];
    // A place to play, with the button that actually books it — a row
    // naming a venue we cannot book is a dead end.
    const venue = venues.find((v) => v.booking_url && (!user?.area || v.area === user.area));
    if (venue)
      filler.push({ id: 0, type: "venue", venue, payload: {}, people: [], count: 0 });
    filler.push({ id: 0, type: "invite_friend", payload: {}, people: [], count: 0 });
    if (nearby?.count)
      filler.push({
        id: 0,
        type: "players_near",
        payload: { area: nearby.area },
        people: nearby.people ?? [],
        count: nearby.count,
      });
    return [...items, ...filler].slice(0, Math.max(3, items.length));
  })();

  return (
    <div className="ha">
      {/* The bell used to sit here. It lives in the app header now, beside
          the face, where it is on every screen. */}
      <header className="ha-greet">
        <h1 className="ha-hello" dir="auto">
          {hello} 👋
        </h1>
        <p className="ha-sub" dir="auto">
          {helloSub}
        </p>
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

      {/* The week with nothing in it keeps its countdown and its last
          result — the CTA card above says what to do, these say where the
          player stands. */}
      {week && matches.length === 0 && invites.length === 0 && (
        <section className="ha-sec ha-sec--empty">{emptyWeek()}</section>
      )}

      {/* Always here, even with nothing in it. A section that disappears
          when it is empty teaches the reader that the app has no such thing —
          and this is the one part of it where they can make something happen
          for everybody else. */}
      <section className="ha-sec">
        <div className="ha-sec-head">
          <h2 className="ha-sec-title">{t("אירועים לידך")}</h2>
          {openGames.length > 0 && (
            <Link to="/games/open" className="ha-sec-link">
              {`${t("הכל")} ${openGames.length}`}
            </Link>
          )}
        </div>
        {openGames.length > 0 ? (
          /* Bleeds off the end of the screen on purpose: a row of cards that
             stops neatly at the gutter looks like all there is. */
          <div className="ha-rail">{openGames.slice(0, 8).map(openGameCard)}</div>
        ) : (
          <article className="ha-og ha-og--empty">
            <CourtImage height={70} className="ha-og-court" />
            <div className="ha-og-empty-body">
              <span className="ha-og-empty-title">{t("עוד אין אירועים לידך")}</span>
              <span className="ha-og-empty-sub">{t("תהיה הראשון — שחקנים לידך יראו את זה")}</span>
              <button
                type="button"
                className="ha-og-empty-go"
                onClick={() => navigate("/games/open/new")}
              >
                {t("פתח אירוע")}
              </button>
            </div>
          </article>
        )}
      </section>

      <section className="ha-sec">
        <div className="ha-sec-head">
          <h2 className="ha-sec-title">{t("מה קורה סביבך")}</h2>
        </div>
        <ActivityFeed items={feedItems} />
      </section>
    </div>
  );
}
