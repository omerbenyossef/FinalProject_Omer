import { useLanguage } from "./LanguageContext.jsx";

function BigBrandMark() {
  return (
    <svg width="64" height="64" viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#16a34a" />
      <circle cx="24" cy="24" r="15" fill="#f5f7d4" stroke="#0b1220" strokeWidth="1.4" />
      <path d="M10 15 C 18 22, 18 26, 10 33" stroke="#0b1220" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M38 15 C 30 22, 30 26, 38 33" stroke="#0b1220" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function AuthShell({ children }) {
  const { t } = useLanguage();

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <BigBrandMark />
        <div className="auth-wordmark">Rally</div>
        <p className="auth-tagline">{t("ליגות ספורט עם החברים שלך")}</p>
      </div>
      {children}
    </div>
  );
}
