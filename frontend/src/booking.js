// Where "book a court" goes.
//
// Lazuz is where players in Israel already book, and it has no public API —
// so for now this is a link out, not an integration. The URL lives here
// alone on purpose: pointing it at a per-venue deep link, at a different
// provider, or at a URL carrying an affiliate parameter is a change to this
// file and nothing else.
export const BOOKING_URL = "https://www.lazuz.co.il";

// Deliberately not window.open(). Inside an installed iOS web app, an
// anchor with target="_blank" opens Safari's in-app browser over the top and
// leaves the app running underneath; window.open() is the unreliable one
// there, and can navigate the app itself away — after which coming back
// restarts it from scratch, which looks to the player like being logged out
// and handed the first-run questionnaire again.
export const BOOKING_LINK_PROPS = {
  href: BOOKING_URL,
  target: "_blank",
  rel: "noopener noreferrer",
};
