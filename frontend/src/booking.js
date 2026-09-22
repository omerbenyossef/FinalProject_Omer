// Where "book a court" goes.
//
// Lazuz is where players in Israel already book, and it has no public API —
// so for now this is a link out, not an integration. It lives in one place on
// purpose: pointing it at a per-venue deep link, at a different provider, or
// at a URL carrying an affiliate parameter is a change to this file and
// nothing else.
export const BOOKING_URL = "https://www.lazuz.co.il";

export function openBooking() {
  // noopener because it's a third-party tab, and _blank so the match screen
  // is still there when they come back from booking.
  window.open(BOOKING_URL, "_blank", "noopener,noreferrer");
}
