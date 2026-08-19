import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { useOpenAction } from "./OpenActionContext.jsx";
import { ChevronIcon, PersonIcon, RanksIcon, SettingsIcon, TrophyIcon } from "./Icons.jsx";
import InstallPrompt from "./InstallPrompt.jsx";
import Onboarding from "./Onboarding.jsx";
import SelfRatingPrompt from "./SelfRatingPrompt.jsx";
import ConfirmScoreSheet from "./ConfirmScoreSheet.jsx";
import { translate } from "./translations.js";

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

export default function Layout({ children }) {
  const { user } = useAuth();
  const { sports, selectedSportId, setSelectedSportId } = useSport();
  const { t } = useLanguage();
  const location = useLocation();
  const {
    openAction,
    hasOtherLeagueActivity,
    triggerOpenAction,
    barSheetOpen,
    closeBarSheet,
    barBusy,
    confirmBarAction,
    disputeBarAction,
  } = useOpenAction();
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
      {user && <SelfRatingPrompt />}
      <main className="content">{children}</main>
      {user && (
        <nav className="tabbar">
          <div className="tabbar-row">
            <div className={`tabbar-inner${openAction ? "" : " wide"}`}>
              <NavLink
                to="/profile"
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                aria-label={t("פרופיל")}
              >
                <PersonIcon className="tab-icon" aria-hidden="true" />
                {!openAction && <span className="tab-label">{t("פרופיל")}</span>}
              </NavLink>
              <NavLink
                to="/leagues"
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                aria-label={t("ליגות")}
              >
                <TrophyIcon className="tab-icon" aria-hidden="true" />
                {!openAction && <span className="tab-label">{t("ליגות")}</span>}
                {hasOtherLeagueActivity && <span className="tab-dot" aria-hidden="true" />}
              </NavLink>
              <NavLink
                to="/ranks"
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                aria-label={t("דירוג")}
              >
                <RanksIcon className="tab-icon" aria-hidden="true" />
                {!openAction && <span className="tab-label">{t("דירוג")}</span>}
              </NavLink>
            </div>

            {openAction && (
              <button
                type="button"
                className={`tabbar-action${openAction.lime ? " lime" : ""}`}
                onClick={triggerOpenAction}
              >
                <span className="tabbar-action-body">
                  <span className="tabbar-action-title">{openAction.title}</span>
                  <span className="tabbar-action-sub" dir="ltr">
                    {openAction.subParts.map((part, i) => (
                      <span key={i} style={{ display: "contents" }}>
                        {i > 0 && <span aria-hidden="true">·</span>}
                        <span dir="auto">{part}</span>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="tabbar-action-knob" aria-hidden="true">
                  <ChevronIcon style={{ transform: "scaleX(-1)" }} />
                </span>
              </button>
            )}
          </div>
        </nav>
      )}
      {barSheetOpen && openAction?.kind === "confirm" && (
        <ConfirmScoreSheet
          match={openAction.match}
          currentUserId={user.id}
          busy={barBusy}
          maxSets={openAction.entry.best_of}
          onConfirm={confirmBarAction}
          onDispute={disputeBarAction}
          onClose={closeBarSheet}
        />
      )}
    </div>
  );
}
