import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import { QuestionIcon, CloseIcon } from "./Icons.jsx";
import { hasSeenIntro } from "./onboardingSeen.js";

function seenKey(pageKey) {
  return `pageHelpSeen:${pageKey}`;
}

export default function PageHelp({ pageKey, title, text }) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (localStorage.getItem(seenKey(pageKey))) return;

    function tryShow() {
      if (hasSeenIntro()) {
        setOpen(true);
        return true;
      }
      return false;
    }

    if (tryShow()) return;

    // The intro is a full-screen blocking sequence, so wait for it to be
    // dismissed before auto-popping this page's own explanation on top of it.
    // Players who only saw an older version of the intro are shown it again,
    // so this has to check the version, not just the key's presence.
    const interval = setInterval(() => {
      if (tryShow()) clearInterval(interval);
    }, 300);
    return () => clearInterval(interval);
  }, [pageKey]);

  function close() {
    localStorage.setItem(seenKey(pageKey), "1");
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="page-help-btn" onClick={() => setOpen(true)} aria-label={t("עזרה")}>
        <QuestionIcon aria-hidden="true" />
      </button>
      {open && (
        <div className="page-help-overlay" onClick={close}>
          <div className="page-help-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="page-help-close" onClick={close} aria-label={t("סגור")}>
              <CloseIcon aria-hidden="true" />
            </button>
            <h3 className="page-help-title">{t(title)}</h3>
            <p className="page-help-text">{t(text)}</p>
          </div>
        </div>
      )}
    </>
  );
}
