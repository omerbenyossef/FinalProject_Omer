// Where "book a court" goes.
//
// Lazuz is where players in Israel already book, and it has no public API —
// so this is a link out, not an integration.
//
// It has to be a real address on their site, not the bare domain. I had this
// pointing at https://lazuz.co.il for a day: that root does not load, and it
// failed the same way inside every app's browser, which sent me chasing
// imagined iOS bugs. A link Omer sent from his own browser loads fine
// everywhere, including inside WhatsApp. Only ever put a verified URL here.
//
// This one opens Hadar Yosef, where his group plays. It is one venue, which
// is the honest limit of a single hard-coded link — a per-venue list is what
// would make it right for everyone, and is also where an affiliate parameter
// would live.
export const BOOKING_URL = "https://lazuz.co.il/club?id=251";
