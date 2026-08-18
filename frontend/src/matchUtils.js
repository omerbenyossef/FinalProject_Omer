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
