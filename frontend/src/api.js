const API_BASE = import.meta.env.VITE_API_BASE || "https://league-backend-97i9.onrender.com";

// photo_url comes back as a path on the API host, not on the app's own, so
// anything that puts it in an <img src> has to join it to the base first.
export function mediaUrl(path) {
  return path ? `${API_BASE}${path}` : null;
}

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
  // The JWT Google's button handed the browser. The server checks its
  // signature before it means anything.
  googleSignIn: (credential) =>
    request("/auth/google", { method: "POST", body: { credential }, auth: false }),
  // The second door. Google is the short way in, but a door that depends on
  // nobody else's service being reachable is the one that always opens.
  register: (data) => request("/auth/register", { method: "POST", body: data, auth: false }),
  login: (data) => request("/auth/login", { method: "POST", body: data, auth: false }),
  setPassword: (password) =>
    request("/auth/me/password", { method: "POST", body: { password } }),
  forgotPassword: (email) =>
    request("/auth/forgot-password", { method: "POST", body: { email }, auth: false }),
  resetPassword: (token, newPassword) =>
    request("/auth/reset-password", {
      method: "POST",
      body: { token, new_password: newPassword },
      auth: false,
    }),
  me: () => request("/auth/me"),
  myStats: (sportId) => request(`/auth/me/stats${sportId ? `?sport_id=${sportId}` : ""}`),
  updateProfile: (fields) => request("/auth/me", { method: "PATCH", body: fields }),
  testPush: () => request("/push/test", { method: "POST" }),
  setMyPhoto: (dataUrl) => request("/auth/me/photo", { method: "PUT", body: { data_url: dataUrl } }),
  deleteMyPhoto: () => request("/auth/me/photo", { method: "DELETE" }),
  updateNotificationPreferences: (fields) =>
    request("/auth/me/notifications", { method: "PATCH", body: fields }),
  deleteAccount: (confirmation) =>
    request("/auth/me", { method: "DELETE", body: { confirmation } }),

  // Pairs — the thing that plays padel. Everything here is scoped to a sport,
  // because being somebody's padel partner says nothing about tennis.
  myPairs: (sportId) => request(`/pairs?sport_id=${sportId}`),
  // A pair's own world: its rating, record, leagues and matches, plus both
  // members' personal levels.
  pairDetail: (pairId) => request(`/pairs/${pairId}`),
  pairCandidates: (sportId, q = "") =>
    request(`/pairs/candidates?sport_id=${sportId}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  proposePair: (sportId, partnerId) =>
    request("/pairs", { method: "POST", body: { sport_id: sportId, partner_id: partnerId } }),
  acceptPair: (pairId) => request(`/pairs/${pairId}/accept`, { method: "POST" }),
  declinePair: (pairId) => request(`/pairs/${pairId}/decline`, { method: "POST" }),
  dissolvePair: (pairId) => request(`/pairs/${pairId}`, { method: "DELETE" }),
  // A one-time link for somebody who is not in the app yet.
  createPairInviteLink: (sportId) =>
    request("/pairs/invite-links", { method: "POST", body: { sport_id: sportId } }),
  getPairInviteLink: (token) => request(`/pairs/invite-links/${token}`),
  redeemPairInviteLink: (token) =>
    request(`/pairs/invite-links/${token}/redeem`, { method: "POST" }),

  listSports: () => request("/sports/", { auth: false }),

  listLeagues: () => request("/leagues/", { auth: false }),
  // pairId is the pair switcher's lens: with one chosen, these answer for
  // that pair alone. Omitted, they answer for all of the player's pairs.
  myLeagues: (pairId) => request(`/leagues/mine${pairId ? `?pair_id=${pairId}` : ""}`),

  // 189b — games somebody opened that anyone at the right level can join.
  openGames: (sportId, { mine = false } = {}) =>
    request(`/open-games?sport_id=${sportId}${mine ? "&mine=true" : ""}`),
  createOpenGame: (body) => request("/open-games", { method: "POST", body }),
  joinOpenGame: (id) => request(`/open-games/${id}/join`, { method: "POST" }),
  leaveOpenGame: (id) => request(`/open-games/${id}/leave`, { method: "POST" }),
  cancelOpenGame: (id) => request(`/open-games/${id}/cancel`, { method: "POST" }),
  myNextMatches: (pairId) =>
    request(`/leagues/mine/next-matches${pairId ? `?pair_id=${pairId}` : ""}`),
  myOpenItems: (pairId) =>
    request(`/leagues/mine/open-items${pairId ? `?pair_id=${pairId}` : ""}`),
  opsOverview: (range) => request(`/ops/overview?range=${range}`),
  createLeague: (data) => request("/leagues/", { method: "POST", body: data }),
  getLeague: (id) => request(`/leagues/${id}`, { auth: false }),
  // pairId is required by a doubles league and refused by a singles one.
  joinLeague: (id, code, pairId = null) =>
    request(`/leagues/${id}/join`, {
      method: "POST",
      body: pairId ? { code, pair_id: pairId } : { code },
    }),
  leaveLeague: (id) => request(`/leagues/${id}/leave`, { method: "POST" }),
  // The way into a private league: a token nobody reads, inside a share link.
  createLeagueInviteLink: (id, rotate = false) =>
    request(`/leagues/${id}/invite-links${rotate ? "?rotate=true" : ""}`, { method: "POST" }),
  getLeagueInviteLink: (token) => request(`/leagues/invite-links/${token}`),
  redeemLeagueInviteLink: (token, pairId = null) =>
    request(`/leagues/invite-links/${token}/redeem`, {
      method: "POST",
      body: pairId ? { pair_id: pairId } : {},
    }),
  deleteLeague: (id) => request(`/leagues/${id}`, { method: "DELETE" }),
  updateLeagueRules: (id, data) => request(`/leagues/${id}/rules`, { method: "PATCH", body: data }),
  // pairId: a doubles league is entered by the pair, so it is the pair's
  // level that has to fit the league's range — see _entrant_level.
  getOpenLeagues: (sportId, { lat, lng, ntrpMin, ntrpMax, pairId } = {}) =>
    request(
      `/leagues/open?sport_id=${sportId}` +
        (lat != null ? `&lat=${lat}` : "") +
        (lng != null ? `&lng=${lng}` : "") +
        (ntrpMin != null ? `&ntrp_min=${ntrpMin}` : "") +
        (ntrpMax != null ? `&ntrp_max=${ntrpMax}` : "") +
        (pairId ? `&pair_id=${pairId}` : "")
    ),
  getLeaguePreview: (id, { lat, lng, pairId } = {}) =>
    request(
      `/leagues/${id}/preview?` +
        (lat != null ? `lat=${lat}&` : "") +
        (lng != null ? `lng=${lng}&` : "") +
        (pairId ? `pair_id=${pairId}` : "")
    ),

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

  homeWeek: (sportId, pairId) =>
    request(
      `/home/week${sportId ? `?sport_id=${sportId}` : ""}${
        pairId ? `${sportId ? "&" : "?"}pair_id=${pairId}` : ""
      }`
    ),
  // 203b — the home screen's "around you" feed, and the clap on one of its
  // rows. The clap is a toggle: one call, whichever way it ends up.
  activity: (sportId, limit = 6) =>
    request(`/activity?limit=${limit}${sportId ? `&sport_id=${sportId}` : ""}`),
  clapActivity: (eventId) => request(`/activity/${eventId}/clap`, { method: "POST" }),

  openMatches: () => request("/matches/open"),
  remindOpenMatch: (matchId) => request(`/matches/${matchId}/remind`, { method: "POST" }),

  // Scoped to the sport in view, like every other list in the app: a padel
  // player should not be shown tennis business, nor have the bell count it.
  notifications: (sportId, pairId) =>
    request(
      `/notifications${sportId ? `?sport_id=${sportId}` : ""}${
        pairId ? `${sportId ? "&" : "?"}pair_id=${pairId}` : ""
      }`
    ),
  markNotificationsRead: (ids) => request("/notifications/read", { method: "POST", body: { ids } }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "POST" }),

  getMatchDetail: (matchId) => request(`/matches/${matchId}`),
  // scheduledAt takes one ISO string or several — a proposal can offer up to
  // five slots for the opponent to pick from.
  proposeMatchSchedule: (
    matchId,
    scheduledAt,
    court,
    { durationMinutes, overrideConflictWarning, venueId } = {}
  ) =>
    request(`/matches/${matchId}/schedule`, {
      method: "POST",
      body: {
        scheduled_at_options: Array.isArray(scheduledAt) ? scheduledAt : [scheduledAt],
        court: court || null,
        venue_id: venueId ?? null,
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
  cancelMatch: (matchId) => request(`/matches/${matchId}/cancel`, { method: "POST" }),
  getMatchChat: (matchId) => request(`/matches/${matchId}/chat`),
  sendMatchMessage: (matchId, body) =>
    request(`/matches/${matchId}/chat`, { method: "POST", body: { body } }),
  reportMatchNotPlayed: (matchId) => request(`/matches/${matchId}/report-not-played`, { method: "POST" }),
  rescheduleRounds: (matchId) => request(`/matches/${matchId}/reschedule-rounds`),
  rescheduleToRound: (matchId, roundNumber) =>
    request(`/matches/${matchId}/reschedule-round`, {
      method: "POST",
      body: { round_number: roundNumber },
    }),
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
  createFriendlyInvite: (opponentId, sportId, { deferNotification = false } = {}) =>
    request("/friendly/matches", {
      method: "POST",
      body: { opponent_id: opponentId, sport_id: sportId, defer_notification: deferNotification },
    }),
  acceptFriendlyInvite: (matchId) => request(`/friendly/matches/${matchId}/accept`, { method: "POST" }),
  declineFriendlyInvite: (matchId) => request(`/friendly/matches/${matchId}/decline`, { method: "POST" }),
  cancelFriendlyInvite: (matchId) => request(`/friendly/matches/${matchId}/cancel`, { method: "POST" }),
  remindFriendly: (matchId) => request(`/friendly/matches/${matchId}/remind`, { method: "POST" }),
  reportFriendlyScore: (matchId, sets, requireConfirmation) =>
    request(`/friendly/matches/${matchId}/score`, {
      method: "POST",
      body: { sets, require_confirmation: requireConfirmation },
    }),
  createFriendlyInviteLink: (sportId) =>
    request("/friendly/invite-links", { method: "POST", body: { sport_id: sportId } }),
  getFriendlyInviteLink: (token) => request(`/friendly/invite-links/${token}`),
  redeemFriendlyInviteLink: (token) => request(`/friendly/invite-links/${token}/redeem`, { method: "POST" }),

  venues: (sportId) => request(`/venues${sportId ? `?sport_id=${sportId}` : ""}`),
  createVenue: (body) => request("/venues", { method: "POST", body }),
  updateVenue: (id, body) => request(`/venues/${id}`, { method: "PATCH", body }),
  deleteVenue: (id) => request(`/venues/${id}`, { method: "DELETE" }),
  // The picture goes as a data URL the browser already scaled down, the same
  // way a player's own photo does — the venue is identified by its id, so it
  // has to exist before it can be given one.
  setVenueImage: (id, dataUrl) =>
    request(`/venues/${id}/image`, { method: "POST", body: { data_url: dataUrl } }),
  deleteVenueImage: (id) => request(`/venues/${id}/image`, { method: "DELETE" }),

  adminDirectory: () => request("/ops/directory"),
  adminDeleteUser: (userId) => request(`/ops/users/${userId}`, { method: "DELETE" }),
  buildDemoLeague: (sportId) => request(`/ops/demo?sport_id=${sportId}`, { method: "POST" }),
  clearDemoLeague: () => request("/ops/demo", { method: "DELETE" }),

  getVapidKey: () => request("/push/vapid-public-key", { auth: false }),
  subscribePush: (subscription) => request("/push/subscribe", { method: "POST", body: subscription }),
  unsubscribePush: (endpoint) => request("/push/unsubscribe", { method: "POST", body: { endpoint } }),
};
