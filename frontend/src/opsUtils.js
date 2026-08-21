import { roundDueDateObj, timeAgoLabel } from "./matchUtils.js";

// "operatoroverview113a" reason line for the never_started flag needs
// week-granularity (its threshold is already 14+ days), unlike matchUtils'
// timeAgoLabel which stays in days/hours/minutes.
function weeksAgoLabel(date) {
  const diffMs = Date.now() - date.getTime();
  const days = Math.round(diffMs / 86400000);
  const weeks = Math.max(1, Math.round(days / 7));
  return weeks === 1 ? "1 WEEK AGO" : `${weeks} WEEKS AGO`;
}

export function opsTagText(item, t) {
  if (item.flag === "stalled") return `R${item.round_number} · ${t("STALLED")}`;
  if (item.flag === "never_started") return t("NEVER STARTED");
  return t("{n} VOIDED", { n: item.voided_count });
}

export function opsReasonLine(item, t) {
  if (item.flag === "stalled") {
    const due = roundDueDateObj(item.schedule_started_at, item.round_number, item.round_length_days || 7);
    return `${t("ROUND ENDED")} ${timeAgoLabel(due)}`;
  }
  if (item.flag === "never_started") {
    return `${t("CREATED")} ${weeksAgoLabel(new Date(item.created_at))}`;
  }
  if (item.same_pair_voided) return t("SAME PAIR TWICE · WORTH A LOOK");
  return t("{n} MATCHES VOIDED", { n: item.voided_count });
}

// {current, total, label} for the flagged row's progress bar. total is null
// when there's nothing meaningful to divide by (a never_started league with
// no capacity set) — the caller shows plain text instead of a bar then.
export function opsProgress(item, t) {
  if (item.flag === "stalled") {
    return { current: item.round_matches_played, total: item.round_matches_total, label: t("PLAYED") };
  }
  if (item.flag === "never_started") {
    return { current: item.member_count, total: item.capacity, label: t("JOINED") };
  }
  return { current: item.voided_count, total: item.league_matches_total, label: t("VOIDED") };
}

export function opsHealthyLine(league, t) {
  if (!league.schedule_started_at) return `${league.member_count} ${t("JOINED")}`;
  return `R${league.round_number} · ${league.matches_played}/${league.matches_total}`;
}
