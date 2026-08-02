import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import { QuestionIcon, CloseIcon } from "./Icons.jsx";

function seenKey(pageKey) {
  return `pageHelpSeen:${pageKey}`;
}

export default function PageHelp({ pageKey, title, text }) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (localStorage.getItem(seenKey(pageKey))) return;

    function tryShow() {
      if (localStorage.getItem("onboardingSeen")) {
        setOpen(true);
        return true;
      }
      return false;
    }

    if (tryShow()) return;

    // Onboarding is a full-screen blocking modal, so wait for it to be
    // dismissed before auto-popping this page's own explanation on top of it.
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
