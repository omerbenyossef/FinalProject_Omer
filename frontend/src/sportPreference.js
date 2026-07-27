const STORAGE_KEY = "rally-selected-sport";

export function getStoredSportId() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? Number(stored) : null;
}

export function setStoredSportId(id) {
  localStorage.setItem(STORAGE_KEY, String(id));
}
