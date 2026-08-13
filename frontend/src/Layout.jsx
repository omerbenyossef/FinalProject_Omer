import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { PersonIcon, SettingsIcon, TrophyIcon } from "./Icons.jsx";
import InstallPrompt from "./InstallPrompt.jsx";
import Onboarding from "./Onboarding.jsx";
import { translate } from "./translations.js";

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

export default function Layout({ children }) {
  const { user } = useAuth();
  const { sports, selectedSportId, setSelectedSportId } = useSport();
  const { t } = useLanguage();
  const location = useLocation();
  const isAuthRoute = AUTH_PATHS.includes(location.pathname);

  if (isAuthRoute) {
    return <main className="content auth-content">{children}</main>;
  }

  const selectedSport = sports.find((s) => s.id === selectedSportId);

  return (
    <div className="app-shell">
      <header className="topbar">
        {user ? (
          <>
            <Link to="/settings" className="topbar-icon-btn" aria-label={t("הגדרות")}>
              <SettingsIcon aria-hidden="true" />
            </Link>
            <div className="wordmark-cluster">
              <span className="wordmark-rally">RALLY</span>
              <span className="wordmark-dot" />
              {sports.length > 0 && selectedSport && (
                <span className="wordmark-sport-wrap">
                  <span className="wordmark-sport">{translate(selectedSport.name, "en")}</span>
                  <select
                    className="wordmark-sport-select"
                    aria-label={t("בחר ענף")}
                    value={selectedSportId ?? ""}
                    onChange={(e) => setSelectedSportId(Number(e.target.value))}
                  >
                    {sports.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {t(sport.name)}
                      </option>
                    ))}
                  </select>
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <Link to="/leagues" className="brand">
              Rally
            </Link>
            <nav>
              <Link to="/login">{t("כניסה")}</Link>
              <Link to="/register">{t("הרשמה")}</Link>
            </nav>
          </>
        )}
      </header>
      {user && <Onboarding />}
      {user && <InstallPrompt />}
      <main className="content">{children}</main>
      {user && (
        <nav className="tabbar">
          <div className="tabbar-inner">
            <NavLink
              to="/leagues"
              className={({ isActive }) => `tab${isActive ? " active" : ""}`}
              aria-label={t("ליגות")}
            >
              <TrophyIcon className="tab-icon" aria-hidden="true" />
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) => `tab${isActive ? " active" : ""}`}
              aria-label={t("פרופיל")}
            >
              <PersonIcon className="tab-icon" aria-hidden="true" />
            </NavLink>
          </div>
        </nav>
      )}
    </div>
  );
}
