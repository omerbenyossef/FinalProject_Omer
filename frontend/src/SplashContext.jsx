import { createContext, useContext } from "react";

// Whether the cold-start splash (and the loading screen behind it) is done.
// The sign-in form waits for this: iOS offers to fill a saved password the
// moment a login form is in the DOM, so with the form mounted underneath the
// splash that prompt arrives over a full-screen lime logo, naming a site and
// a field the person cannot see.
const SplashContext = createContext(true);

export const SplashProvider = SplashContext.Provider;

export function useSplashDone() {
  return useContext(SplashContext);
}
