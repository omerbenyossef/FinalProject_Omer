const API_BASE = import.meta.env.VITE_API_BASE || "https://league-backend-97i9.onrender.com";

function getToken() {
  return localStorage.getItem("token");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("השרת לא הגיב בזמן. נסו שוב בעוד רגע.");
    }
    throw new Error("לא ניתן להתחבר לשרת. בדקו את החיבור לאינטרנט ונסו שוב.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let detail = res.statusText;
    let data = null;
    try {
      data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    const err = new Error(detail);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (data) => request("/auth/register", { method: "POST", body: data, auth: false }),
  login: (data) => request("/auth/login", { method: "POST", body: data, auth: false }),
  me: () => request("/auth/me"),
  forgotPassword: (email) =>
    request("/auth/forgot-password", { method: "POST", body: { email }, auth: false }),
  resetPassword: (token, newPassword) =>
    request("/auth/reset-password", {
      method: "POST",
      body: { token, new_password: newPassword },
      auth: false,
    }),
  myStats: (sportId) => request(`/auth/me/stats${sportId ? `?sport_id=${sportId}` : ""}`),
  updateProfile: (fields) => request("/auth/me", { method: "PATCH", body: fields }),
  updateNotificationPreferences: (fields) =>
    request("/auth/me/notifications", { method: "PATCH", body: fields }),
  changePassword: (currentPassword, newPassword) =>
    request("/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    }),
  changeEmail: (currentPassword, newEmail) =>
    request("/auth/change-email", {
      method: "POST",
      body: { current_password: currentPassword, new_email: newEmail },
    }),
  deleteAccount: (password) =>
    request("/auth/me", { method: "DELETE", body: { password } }),

  listSports: () => request("/sports/", { auth: false }),

  listLeagues: () => request("/leagues/", { auth: false }),
  myLeagues: () => request("/leagues/mine"),
  myNextMatches: () => request("/leagues/mine/next-matches"),
  myOpenItems: () => request("/leagues/mine/open-items"),
  opsOverview: (range) => request(`/ops/overview?range=${range}`),
  createLeague: (data) => request("/leagues/", { method: "POST", body: data }),
  getLeague: (id) => request(`/leagues/${id}`, { auth: false }),
  joinLeague: (id, code) => request(`/leagues/${id}/join`, { method: "POST", body: { code } }),
  leaveLeague: (id) => request(`/leagues/${id}/leave`, { method: "POST" }),
  getInviteCode: (id) => request(`/leagues/${id}/invite-code`),
  deleteLeague: (id) => request(`/leagues/${id}`, { method: "DELETE" }),
  updateLeagueRules: (id, data) => request(`/leagues/${id}/rules`, { method: "PATCH", body: data }),
  getOpenLeagues: (sportId, { lat, lng, ntrpMin, ntrpMax } = {}) =>
    request(
      `/leagues/open?sport_id=${sportId}` +
        (lat != null ? `&lat=${lat}` : "") +
        (lng != null ? `&lng=${lng}` : "") +
        (ntrpMin != null ? `&ntrp_min=${ntrpMin}` : "") +
        (ntrpMax != null ? `&ntrp_max=${ntrpMax}` : "")
    ),
  getLeaguePreview: (id, { lat, lng } = {}) =>
    request(
      `/leagues/${id}/preview?` +
        (lat != null ? `lat=${lat}&` : "") +
        (lng != null ? `lng=${lng}` : "")
    ),
  resolveJoinCode: (code) => request(`/leagues/resolve-code/${code}`),

  headToHead: (opponentId) => request(`/players/${opponentId}/head-to-head`),
  playerProfile: (playerId, sportId) => request(`/players/${playerId}?sport_id=${sportId}`),
  rankings: (sportId, sort, cursor, limit = 50) =>
    request(
      `/players/rankings?sport_id=${sportId}&sort=${sort}&limit=${limit}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`
    ),
  listMembers: (id) => request(`/leagues/${id}/members`, { auth: false }),
  getStandings: (id) => request(`/leagues/${id}/standings`, { auth: false }),

  listMatches: (leagueId) => request(`/leagues/${leagueId}/matches/`),
  listAllMatches: (leagueId) => request(`/leagues/${leagueId}/matches/all`, { auth: false }),
  createMatch: (leagueId, opponentId) =>
    request(`/leagues/${leagueId}/matches/`, { method: "POST", body: { opponent_id: opponentId } }),
  generateSchedule: (leagueId) =>
    request(`/leagues/${leagueId}/matches/generate-schedule`, { method: "POST" }),
  reportScore: (leagueId, matchId, sets) =>
    request(`/leagues/${leagueId}/matches/${matchId}/score`, { method: "POST", body: { sets } }),
  sendMatchReminder: (leagueId, matchId) =>
    request(`/leagues/${leagueId}/matches/${matchId}/remind`, { method: "POST" }),
  cancelMatch: (leagueId, matchId) =>
    request(`/leagues/${leagueId}/matches/${matchId}`, { method: "DELETE" }),

  notifications: () => request("/notifications"),
  markNotificationsRead: (ids) => request("/notifications/read", { method: "POST", body: { ids } }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "POST" }),

  getMatchDetail: (matchId) => request(`/matches/${matchId}`),
  // scheduledAt takes one ISO string or several — a proposal can offer up to
  // five slots for the opponent to pick from.
  proposeMatchSchedule: (matchId, scheduledAt, court, { durationMinutes, overrideConflictWarning } = {}) =>
    request(`/matches/${matchId}/schedule`, {
      method: "POST",
      body: {
        scheduled_at_options: Array.isArray(scheduledAt) ? scheduledAt : [scheduledAt],
        court: court || null,
        duration_minutes: durationMinutes || null,
        override_conflict_warning: !!overrideConflictWarning,
      },
    }),
  confirmMatchSchedule: (matchId, overrideConflictWarning = false, optionId = null) =>
    request(`/matches/${matchId}/schedule/confirm`, {
      method: "POST",
      body: { override_conflict_warning: !!overrideConflictWarning, option_id: optionId },
    }),
  declineMatchSchedule: (matchId) => request(`/matches/${matchId}/schedule/decline`, { method: "POST" }),
  reportMatchNotPlayed: (matchId) => request(`/matches/${matchId}/report-not-played`, { method: "POST" }),
  confirmMatchResult: (matchId) => request(`/matches/${matchId}/confirm`, { method: "POST" }),
  disputeMatchResult: (matchId, sets, note) =>
    request(`/matches/${matchId}/dispute`, { method: "POST", body: { sets, note: note || null } }),
  rejectMatchCorrection: (matchId) => request(`/matches/${matchId}/dispute/reject`, { method: "POST" }),
  cancelMatchCorrection: (matchId) => request(`/matches/${matchId}/dispute/cancel`, { method: "POST" }),

  myRatings: () => request("/ratings/me"),
  checkRating: (leagueId) => request(`/leagues/${leagueId}/rating-check`),
  submitRating: (leagueId, answers) =>
    request(`/leagues/${leagueId}/rate`, { method: "POST", body: answers }),
  retakeRating: (sportId, answers) =>
    request(`/ratings/${sportId}/retake`, { method: "POST", body: answers }),
  submitInitialRating: (sportId, answers) =>
    request(`/ratings/${sportId}/submit`, { method: "POST", body: answers }),

  searchFriendlyPlayers: (sportId, q) =>
    request(`/friendly/players/search?sport_id=${sportId}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  createFriendlyInvite: (opponentId, sportId) =>
    request("/friendly/matches", { method: "POST", body: { opponent_id: opponentId, sport_id: sportId } }),
  acceptFriendlyInvite: (matchId) => request(`/friendly/matches/${matchId}/accept`, { method: "POST" }),
  declineFriendlyInvite: (matchId) => request(`/friendly/matches/${matchId}/decline`, { method: "POST" }),
  remindFriendly: (matchId) => request(`/friendly/matches/${matchId}/remind`, { method: "POST" }),
  reportFriendlyScore: (matchId, sets, requireConfirmation) =>
    request(`/friendly/matches/${matchId}/score`, {
      method: "POST",
      body: { sets, require_confirmation: requireConfirmation },
    }),
  createFriendlyInviteLink: (sportId) =>
    request("/friendly/invite-links", { method: "POST", body: { sport_id: sportId } }),
  redeemFriendlyInviteLink: (token) => request(`/friendly/invite-links/${token}/redeem`, { method: "POST" }),

  getVapidKey: () => request("/push/vapid-public-key", { auth: false }),
  subscribePush: (subscription) => request("/push/subscribe", { method: "POST", body: subscription }),
  unsubscribePush: (endpoint) => request("/push/unsubscribe", { method: "POST", body: { endpoint } }),
};
