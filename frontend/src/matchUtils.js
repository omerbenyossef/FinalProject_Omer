// Shared NTRP scale, 1.5–7.0 in half-steps. Levels above 5.5 are reachable
// only through the competitive questionnaire route (see rating_utils.py's
// QUESTIONNAIRE_STANDARD_MAX) — this array still spans the full range since
// it drives every level picker and scale bar in the app.
export const NTRP_STEPS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7];

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
    const iAmPlayer1 = m.player1.id === userId;
    const reporter = m.reported_by === m.player1.id ? m.player1 : m.player2;
    const mySets = iAmPlayer1
      ? m.sets
      : m.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));
    return {
      kind: "confirm",
      entry,
      match: m,
      lime: true,
      title: t("אשר {score}", { score: formatSets(mySets) }),
      subParts: [reporter.name, m.round_number ? t("מחזור {n}", { n: m.round_number }) : "FRIENDLY"],
    };
  }

  if (candidates.report.length > 0) {
    const entry = sortEarliest(candidates.report)[0];
    const m = entry.match;
    const opponent = m.player1.id === userId ? m.player2 : m.player1;
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
      title: t("דווח מול {name}", { name: opponent.name }),
      subParts,
    };
  }

  if (candidates.proposed.length > 0) {
    const entry = sortEarliest(candidates.proposed)[0];
    const m = entry.match;
    const opponent = m.player1.id === userId ? m.player2 : m.player1;
    return {
      kind: "schedule",
      entry,
      match: m,
      lime: false,
      title: t("{name} הציע {date}", {
        name: opponent.name,
        date: formatDayMonthTime(new Date(m.scheduled_at)),
      }),
      subParts: [t("לאישור השעה")],
    };
  }

  return null;
}

// Tab-bar action button preview (title/subParts/lime) for the single
// highest-priority item from GET /leagues/mine/open-items — same wording as
// buildOpenAction above, just sourced from the server-corrected open-items
// list instead of client-derived candidates (which had a real bug: it
// treated a correction *I* sent as something *I* needed to confirm).
export function buildTabbarPreview(item, userId, t) {
  if (!item) return null;
  const m = item.match;
  const iAmPlayer1 = m.player1.id === userId;
  const opponent = iAmPlayer1 ? m.player2 : m.player1;
  const roundOrFriendly = m.round_number ? t("מחזור {n}", { n: m.round_number }) : "FRIENDLY";

  if (item.type === "confirm") {
    const claimSets = m.corrected_sets ?? m.sets;
    const mySets = iAmPlayer1
      ? claimSets
      : claimSets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));
    return {
      kind: "confirm",
      match: m,
      lime: true,
      title: t("אשר {score}", { score: formatSets(mySets) }),
      subParts: [opponent.name, roundOrFriendly],
    };
  }

  if (item.type === "report") {
    const due = roundDueDateObj(item.schedule_started_at, m.round_number, item.round_length_days);
    const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
    return {
      kind: "report",
      match: m,
      lime: true,
      title: t("דווח מול {name}", { name: opponent.name }),
      subParts: [roundOrFriendly, daysLeft !== null ? daysLeftLabel(daysLeft) : null].filter(Boolean),
    };
  }

  if (item.type === "proposed") {
    return {
      kind: "schedule",
      match: m,
      lime: false,
      title: t("{name} הציע {date}", {
        name: opponent.name,
        date: formatDayMonthTime(new Date(m.scheduled_at)),
      }),
      subParts: [t("לאישור השעה")],
    };
  }

  // waiting
  return {
    kind: "waiting",
    match: m,
    lime: false,
    title: t("ממתין לתשובה מ{name}", { name: opponent.name }),
    subParts: [roundOrFriendly],
  };
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

// Builds every display string a needsyou112a.md item row needs, in the
// viewer's language. Kept as one function (rather than scattering this
// logic across NeedsYou.jsx and Layout.jsx) so the tab-bar preview and the
// full list always agree on wording.
export function buildOpenItemDisplay(item, userId, t) {
  const m = item.match;
  const iAmPlayer1 = m.player1.id === userId;
  const opponent = iAmPlayer1 ? m.player2 : m.player1;
  const roundLabel = m.round_number ? `R${m.round_number}` : null;
  const leagueOrFriendly = item.league_name || t("FRIENDLY");

  // Everything the viewer has already done and is now waiting on the opponent
  // for. Three different things, and the row has to say which.
  if (item.type === "waiting") {
    if (m.corrected_sets != null) {
      return {
        typeLabel: t("CORRECTION SENT · WAITING"),
        opponentName: opponent.name,
        opponentId: opponent.id,
        context: t("NOT COUNTED UNTIL THEY ANSWER"),
        secondaryLabel: t("CANCEL"),
        waitingKind: "correction",
      };
    }
    if (m.status === "pending_confirmation") {
      const notPlayedClaim = m.void_reason === "not_played";
      const mySets = iAmPlayer1
        ? m.sets
        : m.sets?.map((set) => ({ player1_games: set.player2_games, player2_games: set.player1_games }));
      return {
        typeLabel: notPlayedClaim ? t("YOU REPORTED IT WASN'T PLAYED · WAITING") : t("YOU REPORTED · WAITING"),
        opponentName: opponent.name,
        opponentId: opponent.id,
        value: notPlayedClaim ? null : formatSets(mySets),
        valueKind: "score",
        context: [leagueOrFriendly, roundLabel, t("NOT COUNTED UNTIL THEY ANSWER")]
          .filter(Boolean)
          .join(" · "),
        secondaryLabel: t("תזכורת"),
        waitingKind: "remind",
      };
    }
    return {
      typeLabel: t("TIME PROPOSED · WAITING"),
      opponentName: opponent.name,
      opponentId: opponent.id,
      value: m.scheduled_at ? formatWeekdayTime(new Date(m.scheduled_at)).split(" ")[1] : null,
      valueKind: "time",
      context: [leagueOrFriendly, roundLabel].filter(Boolean).join(" · "),
      secondaryLabel: t("תזכורת"),
      waitingKind: "remind",
    };
  }

  if (item.type === "confirm") {
    const isNotPlayedClaim = m.void_reason === "not_played" && m.corrected_sets == null;
    if (isNotPlayedClaim) {
      return {
        typeLabel: t("דיווח: המשחק לא בוצע"),
        age: compactAge(claimSubmittedAt(m.auto_confirm_at)),
        opponentName: opponent.name,
        opponentId: opponent.id,
        context: [leagueOrFriendly, roundLabel].filter(Boolean).join(" · "),
        primaryLabel: t("מאשר, המשחק לא בוצע"),
        primaryLime: true,
        secondaryLabel: t("לא, המשחק כן בוצע"),
      };
    }
    const claimSets = m.corrected_sets ?? m.sets;
    const mySets = iAmPlayer1
      ? claimSets
      : claimSets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));
    let rankClause = null;
    if (item.old_rank != null && item.new_rank != null && item.old_rank !== item.new_rank) {
      rankClause =
        item.new_rank > item.old_rank
          ? t("CONFIRMING DROPS YOU #{old} → #{new}", { old: item.old_rank, new: item.new_rank })
          : t("CONFIRMING MOVES YOU UP #{old} → #{new}", { old: item.old_rank, new: item.new_rank });
    }
    return {
      typeLabel: t("RESULT TO CONFIRM"),
      age: compactAge(claimSubmittedAt(m.auto_confirm_at)),
      opponentName: opponent.name,
      opponentId: opponent.id,
      value: formatSets(mySets),
      valueKind: "score",
      context: [leagueOrFriendly, roundLabel, rankClause].filter(Boolean).join(" · "),
      primaryLabel: t("אישור התוצאה"),
      primaryLime: true,
      secondaryLabel: t("התוצאה לא נכונה"),
    };
  }

  if (item.type === "proposed") {
    const due = roundDueDateObj(item.schedule_started_at, m.round_number, item.round_length_days);
    const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
    const context = [
      m.court || (item.league_id ? leagueOrFriendly : null),
      daysLeft !== null ? t("ROUND ENDS IN {n}D", { n: daysLeft }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      typeLabel: t("TIME PROPOSED TO YOU"),
      age: weekdayShort(new Date(m.scheduled_at)),
      opponentName: opponent.name,
      opponentId: opponent.id,
      value: formatWeekdayTime(new Date(m.scheduled_at)).split(" ")[1],
      valueKind: "time",
      context,
      primaryLabel: t("מאשר, נשחק"),
      primaryLime: false,
      secondaryLabel: t("הצע שעה אחרת"),
    };
  }

  // report — either the agreed time has passed with no score, or the round
  // closed on a match that never got a time in the first place.
  if (!m.scheduled_at) {
    return {
      typeLabel: t("ROUND CLOSED · NOT REPORTED"),
      age: null,
      opponentName: opponent.name,
      opponentId: opponent.id,
      value: roundLabel,
      valueKind: "meta",
      context: [leagueOrFriendly, t("לא נקבע זמן ולא דווחה תוצאה")].filter(Boolean).join(" · "),
      primaryLabel: t("דווח תוצאה"),
      primaryLime: true,
      secondaryLabel: t("המשחק לא בוצע"),
    };
  }
  return {
    typeLabel: t("PLAYED · NOT REPORTED"),
    age: compactAge(new Date(m.scheduled_at)),
    opponentName: opponent.name,
    opponentId: opponent.id,
    value: roundLabel,
    valueKind: "meta",
    context: `${t("PLAYED")} ${formatWeekdayTime(new Date(m.scheduled_at))} · ${t("NEITHER OF YOU REPORTED")}`,
    primaryLabel: t("דווח תוצאה"),
    primaryLime: true,
    secondaryLabel: t("המשחק לא בוצע"),
  };
}

// Picks 4 standings rows to preview: the leader always first, then a window
// around the viewer (one above, them, one below). If the leader would fall
// inside that window, drop the duplicate and pull one more row from below
// instead — see leaguescarousel82a.md section 2.
export function pickStandingsExcerpt(rows, userId) {
  const n = rows.length;
  if (n <= 4) return rows;
  const meIdx = rows.findIndex((r) => r.user.id === userId);
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
