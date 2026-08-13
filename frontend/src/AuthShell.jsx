import { useLanguage } from "./LanguageContext.jsx";
import { TennisIcon } from "./Icons.jsx";

export default function AuthShell({ children }) {
  const { t } = useLanguage();

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <span className="auth-brand-mark">
          <TennisIcon aria-hidden="true" />
        </span>
        <div className="auth-wordmark">Rally</div>
        <p className="auth-tagline">{t("ליגות ספורט עם החברים שלך")}</p>
      </div>
      {children}
    </div>
  );
}
