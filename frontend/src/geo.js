// Thin wrapper over the browser Geolocation API — resolves to null on any
// denial/error/timeout instead of rejecting, since every caller treats "no
// location" as a normal, expected state to degrade gracefully from (never a
// fabricated distance/fit).
export function getCurrentPosition({ timeout = 6000 } = {}) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout, maximumAge: 5 * 60 * 1000 }
    );
  });
}
