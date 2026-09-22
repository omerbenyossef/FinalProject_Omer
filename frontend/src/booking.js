// Where "book a court" goes.
//
// Lazuz is where players in Israel already book, and it has no public API —
// so for now this is a link out, not an integration. The URL lives here
// alone on purpose: pointing it at a per-venue deep link, at a different
// provider, or at a URL carrying an affiliate parameter is a change to this
// file and nothing else.
// No www. This is the host Omer's own link came from — the www form was a
// guess of mine off a search result, and it wouldn't load on his phone.
export const BOOKING_URL = "https://lazuz.co.il";
