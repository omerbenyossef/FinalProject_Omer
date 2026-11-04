// Shared NTRP scale, 1.5–7.0 in half-steps. Levels above 5.5 are reachable
// only through the competitive questionnaire route (see rating_utils.py's
// QUESTIONNAIRE_STANDARD_MAX) — this array still spans the full range since
// it drives every level picker and scale bar in the app.
export const NTRP_STEPS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7];

// Where a level sits on that bar. A level between steps — which every pair's
// level is, since it starts at the mean of two — or outside the range sits on
// the nearest step rather than off the bar entirely.
export function nearestNtrpStep(level) {
  if (level == null) return null;
  let best = NTRP_STEPS[0];
  for (const step of NTRP_STEPS) {
    // <=, not <: a level exactly between two steps (3.75, which is what a
    // pair seeded from a 3.5 and a 4.0 gets) takes the higher one, so the bar
    // agrees with the number printed above it, which rounds up to 3.8.
    if (Math.abs(step - level) <= Math.abs(best - level)) best = step;
  }
  return best;
}

const HEBREW_RANGE = new RegExp("[\\u0590-\\u05FF]");
export function hasHebrewChars(str) {
  return HEBREW_RANGE.test(str || "");
}

export function formatSets(sets) {
  if (!sets || sets.length === 0) return "";
  return sets.map((s) => `${s.player1_games}-${s.player2_games}`).join(" ");
}

function weekEndSaturday(date) {
  const d = new Date(date);
  const daysUntilSaturday = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysUntilSaturday);
  return d;
}

export function formatDayMonth(date) {
  return `${date.getDate()}.${date.getMonth() + 1}`;
}

// "09.09" — zero padded, for the places that line dates up in a mono column.
export function dayMonthPadded(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Whole days between today and a date, counting by the calendar rather than
// by the clock: today is 0, tomorrow is 1. Distinct from daysUntil above,
// which answers "how many days left" and gives null once the day has come.
export function calendarDaysUntil(date) {
  const floor = (d) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  return Math.max(0, Math.round((floor(date) - floor(new Date())) / 86400000));
}

export function formatDayMonthTime(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${formatDayMonth(date)} · ${h}:${m}`;
}

export const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const MONTH_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

// Weekday and month names follow the language like any other word. Pass `t`
// wherever the label is shown to a reader; without it these stay Latin (a few
// internal/sorting uses don't care).
// "an hour and a half" rather than "90 minutes" — how the players say it.
export function durationLabel(minutes, t) {
  if (minutes === 60) return t("שעה");
  if (minutes === 90) return t("שעה וחצי");
  if (minutes === 120) return t("שעתיים");
  return t("{n} דקות", { n: minutes });
}

export function weekdayName(date, t) {
  const key = WEEKDAY_SHORT[date.getDay()];
  return t ? t(key) : key;
}

export function monthName(date, t) {
  const key = MONTH_SHORT[date.getMonth()];
  return t ? t(key) : key;
}

// "WED 20:00" — the weekday plus the time, used across the schedule flow.
export function formatWeekdayTime(date, t) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${weekdayName(date, t)} ${h}:${m}`;
}

// The weekday on its own, for spots like 109b's "R1 OPENS SUN".
export function weekdayShort(date, t) {
  return weekdayName(date, t);
}

// The weekday written out. WEEKDAY_SHORT's three-letter keys read fine in a
// dense row, but a screen whose whole subject is one date says the day in
// full — match-set-180a's "שלישי, 22.9".
export const WEEKDAY_FULL = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function weekdayFull(date, t) {
  const key = WEEKDAY_FULL[date.getDay()];
  return t ? t(key) : key;
}

// formatWeekdayTime plus the calendar date — for screens where deciding
// whether you can make it depends on knowing which day it actually is, not
// just which weekday.
export function formatWeekdayDateTime(date, t) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${weekdayName(date, t)} ${formatDayMonth(date)} · ${h}:${m}`;
}

// Whole days between now and a future date, or null if it's already passed —
// callers drop the countdown entirely rather than show a negative/zero one
// (firstdayandemptystates109.md rule 1: no content, no placeholder).
export function daysUntil(date) {
  if (!date) return null;
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  return days > 0 ? days : null;
}

// Translatable equivalent of daysLeftLabel, for spots in the UI that render
// in the app's own language rather than always-English numeric labels.
// How many days until a league opens, or null once it has opened (or never
// said when it would). A league whose rounds are anchored to a future date
// isn't running yet, and "3 days left in round 1" would say it is.
export function daysUntilOpen(startsAt, now = new Date()) {
  if (!startsAt) return null;
  const open = new Date(startsAt);
  const openDay = new Date(open.getFullYear(), open.getMonth(), open.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((openDay - today) / 86400000);
  return days > 0 ? days : null;
}

export function daysLeftPhrase(daysLeft, t) {
  return daysLeft === 1 ? t("יום אחד נותר") : t("{n} ימים נותרו", { n: daysLeft });
}

// The active round and how many days are left in it, or both null if the
// league has no schedule yet or its current round's due date has passed
// (the caller falls back to a different meta detail in that case).
export function activeRoundStatus(scheduleStartedAt, roundLengthDays = 7) {
  if (!scheduleStartedAt) return { round: null, daysLeft: null };
  const round = currentRoundNumber(scheduleStartedAt, roundLengthDays);
  const due = roundDueDateObj(scheduleStartedAt, round, roundLengthDays);
  const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
  if (daysLeft === null || daysLeft < 0) return { round: null, daysLeft: null };
  return { round, daysLeft };
}

export function daysLeftLabel(daysLeft) {
  if (daysLeft >= 0) return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
  const over = Math.abs(daysLeft);
  return over === 1 ? "1 day over" : `${over} days over`;
}

// "1 DAY" vs "N DAYS" — shared by the schedule flow's mono meta lines.
export function daysWord(n, t) {
  if (!t) return n === 1 ? "DAY" : "DAYS";
  return n === 1 ? t("יום") : t("ימים");
}

// Always-English "2 DAYS AGO" label for the schedule flow's mono meta lines
// (see daysLeftLabel above for the same pattern applied to due dates).
export function timeAgoLabel(date, t) {
  const say = (text, params) => (t ? t(text, params) : text);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60)
    return minutes <= 1 ? say("ממש עכשיו") : say("לפני {n} דקות", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? say("לפני שעה") : say("לפני {n} שעות", { n: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? say("לפני יום") : say("לפני {n} ימים", { n: days });
}

// Who is on each side of a match, from the viewer's point of view — the
// client's half of the backend's match_sides.py.
//
// Every screen used to ask this itself, as `match.player1.id === userId`.
// That works in singles, where the two columns are the two players, and is
// wrong in doubles: player1_id/player2_id name ONE player from each side, so
// a pair's second member is in neither. Screens asking that question found
// none of their own padel matches, and the ones that did show a match drew
// the opposing captain alone instead of the two people across the net.
//
// MatchOut now sends side1/side2 with everyone on them, side one always
// being the side the stored sets and scores are written from. This reads
// those, and falls back to player1/player2 so it is still correct against a
// payload that predates them.
export function matchSides(match, userId) {
  const side1 = match.side1?.length ? match.side1 : [match.player1].filter(Boolean);
  const side2 = match.side2?.length ? match.side2 : [match.player2].filter(Boolean);
  const iAmSide1 = side1.some((p) => p?.id === userId);
  const iAmSide2 = side2.some((p) => p?.id === userId);
  const mine = iAmSide2 ? side2 : side1;
  const theirs = iAmSide2 ? side1 : side2;
  const myLabel = iAmSide2 ? match.side2_label : match.side1_label;
  const theirLabel = iAmSide2 ? match.side1_label : match.side2_label;
  const fallbackLabel = (side) => side.map((p) => p?.name).filter(Boolean).join("/");
  return {
    isDoubles: !!match.is_doubles,
    // The two sides in the match's own order, for rows that draw both of them
    // rather than "me and them" — a league's fixture list.
    side1,
    side2,
    side1Label: match.side1_label || fallbackLabel(side1),
    side2Label: match.side2_label || fallbackLabel(side2),
    // Whether the viewer is playing in this match at all — a league's round
    // list shows other people's matches too.
    isMine: iAmSide1 || iAmSide2,
    // Which half of the stored score is the viewer's. Named for the side
    // rather than for player1, because in doubles those are not the same
    // question.
    iAmSide1,
    mine,
    opponents: theirs,
    // The single opponent a singles screen draws an avatar and a name for.
    // Null in doubles, where there are two and the screen reads `opponents`
    // or `opponentLabel` instead.
    opponent: theirs.length === 1 ? theirs[0] : null,
    teammate: mine.find((p) => p?.id !== userId) || null,
    myLabel: myLabel || fallbackLabel(mine),
    // "Cohen/Levi" in doubles, the one full name in singles.
    opponentLabel: theirLabel || fallbackLabel(theirs),
  };
}

// Is this match the viewer's own? The question a league's round list asks of
// every row, and the one that quietly hid a partner's matches.
export function isMyMatch(match, userId) {
  return matchSides(match, userId).isMine;
}

// The same question for the single-match screens, which are served
// MatchDetailOut / MatchChatOut rather than MatchOut. Those carry `opponent`
// for singles and leave it null in doubles — where there are two people —
// filling `opponents` and `opponent_label` instead. Every screen that read
// `detail.opponent.name` therefore crashed on a padel match.
export function detailOpponent(detail) {
  const people = detail?.opponents?.length
    ? detail.opponents
    : detail?.opponent
      ? [detail.opponent]
      : [];
  return {
    // What goes in a sentence: "מול Cohen/Levi".
    label: detail?.opponent_label || detail?.opponent?.name || "",
    people,
    // The one person a singles screen can link to a profile; null in doubles,
    // where the screen has to offer two or none.
    one: people.length === 1 ? people[0] : null,
  };
}

// Who filed the report on this match. In singles that is always the opponent,
// which is why the screens said so outright. In doubles it can be the
// viewer's own partner, and "your opponent reported" would then be wrong
// about which of four people pressed the button.
export function reporterName(detail, reportedBy = detail?.reported_by) {
  const everyone = [
    ...(detail?.opponents || []),
    ...(detail?.opponent ? [detail.opponent] : []),
    ...(detail?.teammate ? [detail.teammate] : []),
  ];
  return everyone.find((p) => p?.id === reportedBy)?.name || detailOpponent(detail).label;
}

// A standings row's side. A singles row carries `user`; a doubles row carries
// `side` — a pair, printed "Cohen/Levi" — and leaves `user` null, which is
// what made `row.user.id` throw and take the whole padel league screen with
// it.
export function standingSide(row) {
  if (row?.side) {
    const players = row.side.players || [];
    return {
      key: `pair-${row.side.pair_id}`,
      name: row.side.name || "",
      players,
      // The one player a row can link to a profile: nobody, in a pair.
      one: players.length === 1 ? players[0] : null,
    };
  }
  const user = row?.user || null;
  return {
    key: `user-${user?.id}`,
    name: user?.name || "",
    players: user ? [user] : [],
    one: user,
  };
}

// Is this standings row the viewer's own? True for both members of a pair.
export function standingIsMine(row, userId) {
  return standingSide(row).players.some((p) => p?.id === userId);
}

// State machine for the "schedule a time before you can report a score" gate:
// unscheduled -> proposed_by_me / proposed_by_them -> confirmed_future -> ready.
export function matchScheduleState(match, userId) {
  if (!match.scheduled_at) return "unscheduled";
  if (!match.schedule_confirmed) {
    return match.scheduled_by === userId ? "proposed_by_me" : "proposed_by_them";
  }
  return new Date(match.scheduled_at) > new Date() ? "confirmed_future" : "ready";
}

// Collapses matchScheduleState's 5 states down to the 4 the schedule flow
// (107) shows in the match row and elsewhere: no_time | sent | asked_you | set.
export function scheduleRowStatus(match, userId) {
  const state = matchScheduleState(match, userId);
  if (state === "unscheduled") return "no_time";
  if (state === "proposed_by_me") return "sent";
  if (state === "proposed_by_them") return "asked_you";
  return "set";
}

export function formatWeekLabel(scheduleStartedAt, roundNumber, t, roundLengthDays = 7) {
  if (!scheduleStartedAt || !roundNumber) return "";
  const anchor = new Date(scheduleStartedAt);
  const round1End = weekEndSaturday(anchor);

  let start, end;
  if (roundNumber === 1) {
    start = anchor;
    end = round1End;
  } else {
    start = new Date(round1End);
    start.setDate(start.getDate() + roundLengthDays * (roundNumber - 2) + 1);
    end = new Date(round1End);
    end.setDate(end.getDate() + roundLengthDays * (roundNumber - 1));
  }

  return `${t("שבוע {n}", { n: roundNumber })} (${formatDayMonth(start)} - ${formatDayMonth(end)})`;
}

export function formatWeekShort(roundNumber, t) {
  if (!roundNumber) return "";
  return t("שבוע {n}", { n: roundNumber });
}

export function formatRelativeTime(date, t) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return t("עכשיו");
  if (minutes < 60) return t("לפני {n} דקות", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("לפני {n} שעות", { n: hours });
  const days = Math.round(hours / 24);
  return t("לפני {n} ימים", { n: days });
}

export function roundDueDateObj(scheduleStartedAt, roundNumber, roundLengthDays = 7) {
  if (!scheduleStartedAt || !roundNumber) return null;
  const anchor = new Date(scheduleStartedAt);
  const round1End = weekEndSaturday(anchor);
  const end = new Date(round1End);
  if (roundNumber > 1) end.setDate(end.getDate() + roundLengthDays * (roundNumber - 1));
  return end;
}

export function roundDueDate(scheduleStartedAt, roundNumber, roundLengthDays = 7) {
  const end = roundDueDateObj(scheduleStartedAt, roundNumber, roundLengthDays);
  return end ? formatDayMonth(end) : "";
}

export function leagueRuleLabels(league, t) {
  // "Best of 1" was dropped as a choice (courts are booked by the hour, and
  // a single set isn't a real slot length) but a league created before that
  // still needs a sensible label.
  const bestOfLabels = { 1: t("סט אחד"), 3: t("שעה"), 5: t("שעתיים") };
  const bestOfLabel = bestOfLabels[league.best_of] || bestOfLabels[3];
  const frequencyLabel = league.round_length_days === 14 ? t("מחזור דו-שבועי") : t("מחזור שבועי");
  return { bestOfLabel, frequencyLabel };
}

export function currentRoundNumber(scheduleStartedAt, roundLengthDays = 7, now = new Date()) {
  if (!scheduleStartedAt) return null;
  const anchor = new Date(scheduleStartedAt);
  const round1End = weekEndSaturday(anchor);
  if (now <= round1End) return 1;
  const offsetDays = Math.floor((now - round1End) / 86400000);
  return 2 + Math.floor((offsetDays - 1) / roundLengthDays);
}

export function sortEarliest(entries) {
  return [...entries].sort((a, b) => {
    const rA = a.match.round_number ?? Infinity;
    const rB = b.match.round_number ?? Infinity;
    if (rA !== rB) return rA - rB;
    const sA = a.schedule_started_at ? new Date(a.schedule_started_at).getTime() : Infinity;
    const sB = b.schedule_started_at ? new Date(b.schedule_started_at).getTime() : Infinity;
    return sA - sB;
  });
}

// Splits a list of next-match entries into the three "something to act on"
// buckets, in priority order (confirm > report > proposed schedule). Shared
// by the global tab-bar action (OpenActionContext) and the per-league open
// action on the Leagues carousel card, so both agree on what counts as
// actionable without duplicating the filtering logic.
export function getActionCandidates(entries, userId) {
  if (!userId) return { confirm: [], report: [], proposed: [] };
  return {
    confirm: entries.filter(
      (e) => e.match.status === "pending_confirmation" && e.match.reported_by !== userId
    ),
    report: entries.filter(
      (e) => e.match.status === "pending" && matchScheduleState(e.match, userId) === "ready"
    ),
    proposed: entries.filter(
      (e) => e.match.status === "pending" && matchScheduleState(e.match, userId) === "proposed_by_them"
    ),
  };
}

// Picks the highest-priority candidate and builds the display object for it
// (title/subParts/kind), or null if nothing is actionable. userId is needed
// to tell which side of the match the viewer is on.
export function buildOpenAction(candidates, userId, t) {
  if (!userId) return null;

  if (candidates.confirm.length > 0) {
    const entry = sortEarliest(candidates.confirm)[0];
    const m = entry.match;
    const sides = matchSides(m, userId);
    // Whoever actually pressed report, which in doubles is any one of four
    // people — so look for them across both sides rather than assuming they
    // are one of the two named columns.
    const reporter = [...sides.mine, ...sides.opponents].find((p) => p?.id === m.reported_by);
    const mySets = sides.iAmSide1
      ? m.sets
      : m.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));
    return {
      kind: "confirm",
      entry,
      match: m,
      lime: true,
      title: t("אשר {score}", { score: formatSets(mySets) }),
      subParts: [
        reporter?.name || sides.opponentLabel,
        m.round_number ? t("מחזור {n}", { n: m.round_number }) : "FRIENDLY",
      ],
    };
  }

  if (candidates.report.length > 0) {
    const entry = sortEarliest(candidates.report)[0];
    const m = entry.match;
    const { opponentLabel } = matchSides(m, userId);
    const due = roundDueDateObj(entry.schedule_started_at, m.round_number, 7);
    const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
    const subParts = [
      m.round_number ? t("מחזור {n}", { n: m.round_number }) : "FRIENDLY",
      daysLeft !== null ? daysLeftLabel(daysLeft) : null,
    ].filter(Boolean);
    return {
      kind: "report",
      entry,
      match: m,
      lime: true,
      title: t("דווח מול {name}", { name: opponentLabel }),
      subParts,
    };
  }

  if (candidates.proposed.length > 0) {
    const entry = sortEarliest(candidates.proposed)[0];
    const m = entry.match;
    const { opponentLabel } = matchSides(m, userId);
    return {
      kind: "schedule",
      entry,
      match: m,
      lime: false,
      title: t("{name} הציע {date}", {
        name: opponentLabel,
        date: formatDayMonthTime(new Date(m.scheduled_at)),
      }),
      subParts: [t("לאישור השעה")],
    };
  }

  return null;
}

// Compact "2H"/"3D" age marker for needsyou112a.md's item rows — always
// English/mono, distinct from timeAgoLabel's verbose "2 HOURS AGO" form.
export function compactAge(date) {
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "NOW";
  if (minutes < 60) return `${minutes}M`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}H`;
  const days = Math.round(hours / 24);
  return `${days}D`;
}

// report_score and dispute_result (backend) both reset auto_confirm_at to
// now+48h whenever a new claim (report or correction) is submitted, and
// there's no dedicated "reported/corrected at" column — so working backward
// from auto_confirm_at recovers that moment for the "2H" age marker.
const CONFIRMATION_WINDOW_MS = 48 * 60 * 60 * 1000;
export function claimSubmittedAt(autoConfirmAt) {
  return autoConfirmAt ? new Date(new Date(autoConfirmAt).getTime() - CONFIRMATION_WINDOW_MS) : null;
}

// Where tapping an open item (needsyou112a.md) should navigate — used both
// for the tab-bar's "1 item -> jump straight to it" case and for tapping a
// row on the NEEDS YOU list itself.
export function openItemRoute(item) {
  const m = item.match;
  if (item.type === "confirm") return `/matches/${m.id}/confirm`;
  if (item.type === "proposed") return `/matches/${m.id}`;
  if (item.type === "report") return `/matches/${m.id}`;
  // waiting: I've already done my part, so this is the "waiting on them"
  // screen, not the reporting one (match-pending-confirm-159a).
  return `/matches/${m.id}/pending`;
}

// Picks 4 standings rows to preview: the leader always first, then a window
// around the viewer (one above, them, one below). If the leader would fall
// inside that window, drop the duplicate and pull one more row from below
// instead — see leaguescarousel82a.md section 2.
export function pickStandingsExcerpt(rows, userId) {
  const n = rows.length;
  if (n <= 4) return rows;
  const meIdx = rows.findIndex((r) => standingIsMine(r, userId));
  if (meIdx === -1) return rows.slice(0, 4);
  if (meIdx === 0) return rows.slice(0, 4);
  if (meIdx === n - 1) return rows.slice(n - 4, n);
  if (meIdx === 1) return [rows[0], rows[1], rows[2], rows[3]];
  return [rows[0], rows[meIdx - 1], rows[meIdx], rows[meIdx + 1]];
}

// Mirrors the backend's circle-method round robin in matches.py (_round_robin_rounds),
// so the client can preview exactly which pairs the next schedule generation call will create.
function roundRobinRounds(memberIds) {
  const players = [...memberIds];
  if (players.length % 2 === 1) players.push(null);
  const n = players.length;
  const rounds = [];
  let current = players;
  for (let i = 0; i < n - 1; i++) {
    const pairs = [];
    for (let j = 0; j < n / 2; j++) {
      const p1 = current[j];
      const p2 = current[n - 1 - j];
      if (p1 !== null && p2 !== null) pairs.push([p1, p2]);
    }
    rounds.push(pairs);
    current = [current[0], current[current.length - 1], ...current.slice(1, -1)];
  }
  return rounds;
}

function pairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// members must be in league-join order (matches the server's LeagueMembership.id order).
// Mirrors generate_schedule's full loop: a single call walks every ideal round and creates
// whatever pairs are still missing there, so one click can span more than one round_number
// (e.g. a full first cycle, or catch-up pairs for someone who joined late).
export function nextSchedulePreview(members, allMatches) {
  const memberIds = members.map((m) => m.id);
  const existingPairs = new Set(allMatches.map((m) => pairKey(m.player1.id, m.player2.id)));
  const idealRounds = roundRobinRounds(memberIds);
  const byId = new Map(members.map((m) => [m.id, m]));

  const pairs = [];
  let roundsToCreate = 0;
  for (const roundPairs of idealRounds) {
    const newPairs = roundPairs.filter(([a, b]) => !existingPairs.has(pairKey(a, b)));
    if (newPairs.length === 0) continue;
    roundsToCreate += 1;
    for (const [a, b] of newPairs) pairs.push([byId.get(a), byId.get(b)]);
  }
  return { pairs, roundsToCreate };
}

// Saying yes to an invitation that already carries a time has to say yes to
// the time as well. Accepting the invitation alone left it proposed but
// unconfirmed, and both players were then asked to propose one — as if the
// time on the card they had just tapped did not exist.
//
// confirm_match_schedule accepts the invitation itself on the way through
// (its accepts_invite branch), so the one call does both. It answers 409 when
// several times were offered and none was picked; the caller sends the player
// to the match screen to choose.
export async function acceptFriendlyInvitation(api, match) {
  if (match.scheduled_at) {
    return api.confirmMatchSchedule(match.id);
  }
  return api.acceptFriendlyInvite(match.id);
}
