import { useEffect, useState } from "react";

// splash135c.md — the launch icon "assembles itself": a full-screen lime
// tile drops in, the dark ball fades into it, then the tile shrinks back
// down to icon size while the wordmark rises in underneath. Shown once per
// cold start (this is plain component state, not localStorage, so it
// re-runs on every fresh load of the app but never on a route navigation).
const ANIMATION_MS = 2600;
const LEAVE_MS = 260;

export default function Splash({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), ANIMATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onDone, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);

  return (
    <div className={`splash${leaving ? " is-leaving" : ""}`}>
      <div className="splash-tile" aria-hidden="true" />
      <div className="splash-ball" aria-hidden="true">
        <svg width="90" height="90" viewBox="0 0 120 120" fill="none">
          <circle cx="60" cy="60" r="36" fill="#0e1116" />
          <path d="M36 36 Q58 60 36 84" stroke="#c6f24e" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M84 36 Q62 60 84 84" stroke="#c6f24e" strokeWidth="6" strokeLinecap="round" fill="none" />
        </svg>
      </div>
      <div className="splash-word">
        <span>RALLY</span>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}
