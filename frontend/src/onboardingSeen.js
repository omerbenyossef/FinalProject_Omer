// The intro screens are gated on a version, not a plain boolean. When the
// sequence is rewritten, bumping INTRO_VERSION shows it once to players who
// are already using the app and only saw an older version of it.
//
// "1" is the value the original four-step card wrote.
const SEEN_KEY = "onboardingSeen";
export const INTRO_VERSION = "3";

export function hasSeenIntro() {
  return localStorage.getItem(SEEN_KEY) === INTRO_VERSION;
}

export function markIntroSeen() {
  localStorage.setItem(SEEN_KEY, INTRO_VERSION);
}
