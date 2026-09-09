import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";

// loading138b.md — a pulsing ball with breathing halos and a decorative
// progress bar, shown while the app's initial data (the auth check) is
// still in flight. `ready` flips true once that data has actually come
// back; a MIN_MS floor keeps this from flashing for an instant when it
// comes back almost immediately, which would just read as a glitch.
const MIN_MS = 400;
const LEAVE_MS = 240;
const STUCK_MS = 8000;

export default function Loading({ ready, onDone }) {
  const { t } = useLanguage();
  const [minElapsed, setMinElapsed] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready && minElapsed) setLeaving(true);
  }, [ready, minElapsed]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onDone, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);

  return (
    <div className={`ld${leaving ? " is-leaving" : ""}`}>
      <div className="ld-ball-wrap">
        <span className="ld-halo" aria-hidden="true" />
        <span className="ld-halo ld-halo--2" aria-hidden="true" />
        <div className="ld-ball" aria-hidden="true">
          <svg width="118" height="118" viewBox="0 0 120 120" fill="none">
            <circle cx="60" cy="60" r="36" fill="#eef1f7" />
            <path d="M36 36 Q58 60 36 84" stroke="#c6f24e" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M84 36 Q62 60 84 84" stroke="#c6f24e" strokeWidth="6" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      </div>

      <div className="ld-text">
        <div className="ld-word">
          <span>RALLY</span>
          <i aria-hidden="true" />
        </div>
        {stuck ? (
          <>
            <span className="ld-status ld-status-stuck">{t("THIS IS TAKING LONGER THAN USUAL")}</span>
            <button type="button" className="ld-retry" onClick={() => window.location.reload()}>
              {t("נסה שוב")}
            </button>
          </>
        ) : (
          <span className="ld-status">{t("LOADING YOUR LEAGUES")}</span>
        )}
      </div>

      <div className="ld-track" aria-hidden="true">
        <div className="ld-fill" />
      </div>
    </div>
  );
}
