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

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
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
  myStats: () => request("/auth/me/stats"),
  updateProfile: (name, age) => request("/auth/me", { method: "PATCH", body: { name, age } }),
  changePassword: (currentPassword, newPassword) =>
    request("/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    }),

  listSports: () => request("/sports/", { auth: false }),

  listLeagues: () => request("/leagues/", { auth: false }),
  myLeagues: () => request("/leagues/mine"),
  createLeague: (data) => request("/leagues/", { method: "POST", body: data }),
  getLeague: (id) => request(`/leagues/${id}`, { auth: false }),
  joinLeague: (id, code) => request(`/leagues/${id}/join`, { method: "POST", body: { code } }),
  getInviteCode: (id) => request(`/leagues/${id}/invite-code`),

  headToHead: (opponentId) => request(`/players/${opponentId}/head-to-head`),
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
  cancelMatch: (leagueId, matchId) =>
    request(`/leagues/${leagueId}/matches/${matchId}`, { method: "DELETE" }),
};
