import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import { ShareIcon, CloseIcon, TrophyIcon } from "./Icons.jsx";

const DISMISSED_KEY = "installPromptDismissed";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIOS() {
  return (
    (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export default function InstallPrompt() {
  const { t } = useLanguage();
  const [platform, setPlatform] = useState(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY)) return;

    if (isIOS()) {
      setPlatform("ios");
      return;
    }

    function handleBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform("android");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setPlatform(null);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  if (!platform) return null;

  return (
    <div className="install-banner">
      <div className="install-banner-icon">
        <TrophyIcon aria-hidden="true" />
      </div>
      <div className="install-banner-body">
        <p className="install-banner-title">{t("התקן/י את Rally למסך הבית")}</p>
        {platform === "ios" ? (
          <p className="install-banner-text">
            {t("כדי לקבל התראות: לחצו על שיתוף")} <ShareIcon className="install-banner-inline-icon" aria-hidden="true" />{" "}
            {t('ואז "הוסף למסך הבית"')}
          </p>
        ) : (
          <p className="install-banner-text">{t("גישה מהירה והתראות על משחקים חדשים")}</p>
        )}
      </div>
      {platform === "android" && (
        <button type="button" className="btn-secondary btn-small" onClick={handleInstallClick}>
          {t("התקן")}
        </button>
      )}
      <button type="button" className="install-banner-close" onClick={dismiss} aria-label={t("סגור")}>
        <CloseIcon aria-hidden="true" />
      </button>
    </div>
  );
}
