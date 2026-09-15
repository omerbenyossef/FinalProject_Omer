import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import { useAuth } from "./AuthContext.jsx";
import { BellIcon, CloseIcon } from "./Icons.jsx";
import { getExistingSubscription, isPushSupported, subscribeToPush } from "./push.js";
import { hasSeenIntro } from "./onboardingSeen.js";

const DISMISSED_KEY = "pushPromptDismissed";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIOS() {
  return (
    (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Notifications can't be on by default: the browser only hands out a push
// subscription after the person answers the operating system's own dialog, and
// on iOS that dialog only opens from a tap. So the tap comes to them instead
// of waiting in the settings screen — one banner, once, and everything is on
// unless they say no.
export default function PushPrompt() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !isPushSupported()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    // Not on top of the intro, and not before the app is on the home screen —
    // on iOS push doesn't work in the browser tab at all, and asking there
    // spends the one question we get.
    if (!hasSeenIntro()) return;
    if (isIOS() && !isStandalone()) return;
    if (Notification.permission === "denied") return;
    let alive = true;
    (async () => {
      // Already subscribed on this device: nothing to ask.
      if (Notification.permission === "granted" && (await getExistingSubscription())) return;
      if (alive) setShow(true);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  async function enable() {
    setError("");
    setBusy(true);
    try {
      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          // They answered the OS dialog with no; that's the answer.
          dismiss();
          return;
        }
      }
      await subscribeToPush();
      dismiss();
    } catch (err) {
      // The browser's own failures come back in English from the platform, so
      // only our own messages are passed through; anything else gets ours.
      setError(err.message?.includes("בשרת") ? err.message : "לא הצלחנו להפעיל התראות, אפשר לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div className="install-banner push-banner">
      <div className="install-banner-icon">
        <BellIcon aria-hidden="true" />
      </div>
      <div className="install-banner-body">
        <p className="install-banner-title">{t("שנודיע לך על המשחקים שלך?")}</p>
        <p className="install-banner-text">
          {error ? t(error) : t("כשקובעים לך משחק, כשמחכים לאישור שלך, וכשמחזור נפתח.")}
        </p>
      </div>
      <button type="button" className="btn-bright btn-small" onClick={enable} disabled={busy}>
        {busy ? t("רגע...") : t("כן")}
      </button>
      <button type="button" className="install-banner-close" onClick={dismiss} aria-label={t("סגור")}>
        <CloseIcon aria-hidden="true" />
      </button>
    </div>
  );
}
