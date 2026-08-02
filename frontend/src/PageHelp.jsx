import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import { QuestionIcon, CloseIcon } from "./Icons.jsx";

export default function PageHelp({ title, text }) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <>
      <button type="button" className="page-help-btn" onClick={() => setOpen(true)} aria-label={t("עזרה")}>
        <QuestionIcon aria-hidden="true" />
      </button>
      {open && (
        <div className="page-help-overlay" onClick={() => setOpen(false)}>
          <div className="page-help-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="page-help-close"
              onClick={() => setOpen(false)}
              aria-label={t("סגור")}
            >
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
