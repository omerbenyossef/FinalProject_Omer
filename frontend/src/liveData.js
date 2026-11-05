import { useEffect, useRef } from "react";

/* The app only ever asked the server for anything when a screen was built or
   the route changed. So an invitation somebody sent you while you were
   looking at the screen it belongs on simply never arrived: the only way to
   see it was to close the app and open it again.

   Two things fix that, and both are needed. Coming back to the app — from
   the background, from another tab — asks again, because that is the moment
   a person expects to be caught up. And while the screen is open and visible
   it asks every so often, because the person who invited you is not going to
   tell you to switch apps and come back.

   Nothing is asked while the app is hidden: a phone in a pocket should not
   be talking to the server. */

export const LIVE_INTERVAL_MS = 45000;

export function useLiveData(load, enabled = true) {
  // The latest load, without re-subscribing every render: these callbacks are
  // usually rebuilt whenever the sport or the pair changes.
  const latest = useRef(load);
  latest.current = load;

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible") latest.current?.();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, LIVE_INTERVAL_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [enabled]);
}
