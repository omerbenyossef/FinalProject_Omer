// Shared NTRP scale, 1.5–7.0 in half-steps. Levels above 5.5 are reachable
// only through the competitive questionnaire route (see rating_utils.py's
// QUESTIONNAIRE_STANDARD_MAX) — this array still spans the full range since
// it drives every level picker and scale bar in the app.
export const NTRP_STEPS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7];

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

export function daysLeftLabel(daysLeft) {
  if (daysLeft >= 0) return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
  const over = Math.abs(daysLeft);
  return over === 1 ? "1 day over" : `${over} days over`;
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
  const bestOfLabels = { 1: t("עד סט אחד"), 3: t("עד 3 סטים"), 5: t("עד 5 סטים") };
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
