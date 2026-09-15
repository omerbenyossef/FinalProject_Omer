import { Link, NavLink, useLocation } from "react-router-dom";
import { mediaUrl } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { useOpenAction } from "./OpenActionContext.jsx";
import { ChevronIcon, HomeIcon, RanksIcon, TrophyIcon } from "./Icons.jsx";
import InstallPrompt from "./InstallPrompt.jsx";
import PushPrompt from "./PushPrompt.jsx";
import Onboarding from "./Onboarding.jsx";

const AUTH_PATHS = ["/signin", "/signup", "/forgot-password", "/reset-password"];

export default function Layout({ children }) {
  const { user } = useAuth();
  const { sports, selectedSportId, setSelectedSportId } = useSport();
  const { t } = useLanguage();
  const location = useLocation();
  const { openAction, hasOtherLeagueActivity, triggerOpenAction } = useOpenAction();
  const isAuthRoute = AUTH_PATHS.includes(location.pathname);
  // leaguerosterbeforejoin154b — the join screen owns the full height below
  // the topbar (its roster scrolls, its footer holds the only action), so the
  // tab bar would just be a second bottom bar competing with it.
  const isJoinPreview = /^\/leagues\/\d+\/preview$/.test(location.pathname);
  // ranks-entry-173: the rankings are pushed over the profile, not a tab —
  // the only way out is back.
  const isRanks = location.pathname === "/ranks";

  if (isAuthRoute) {
    return <main className="content auth-content">{children}</main>;
  }

  const selectedSport = sports.find((s) => s.id === selectedSportId);

  return (
    <div className="app-shell">
      <header className="topbar">
        {user ? (
          <>
            <Link to="/me" className="topbar-avatar" aria-label={t("פרופיל")}>
              {user.photo_url ? (
                <img src={mediaUrl(user.photo_url)} alt="" />
              ) : (
                user.name?.trim()?.[0] ?? "?"
              )}
            </Link>
            <div className="wordmark-cluster">
              <span className="wordmark-rally">RALLY</span>
              <span className="wordmark-dot" />
              {sports.length > 0 && selectedSport && (
                <span className="wordmark-sport-wrap">
                  {/* The sport follows the reader's language; only RALLY itself
                      is a name that never translates. */}
                  <span className="wordmark-sport">{t(selectedSport.name)}</span>
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
              <Link to="/signin">{t("כניסה")}</Link>
              <Link to="/signup">{t("הרשמה")}</Link>
            </nav>
          </>
        )}
      </header>
      {user && <Onboarding />}
      {user && <InstallPrompt />}
      {user && <PushPrompt />}
      <main className="content">{children}</main>
      {user && location.pathname !== "/ops" && !isJoinPreview && !isRanks && (
        <nav className="tabbar">
          <div className="tabbar-row">
            <div className={`tabbar-inner${openAction ? "" : " wide"}`}>
              {/* my-profile-171a: HOME · LEAGUES · MATCHES. The profile moved to
                  the avatar in the header. Labels are Latin mono here, the same
                  language the home screen speaks. */}
              <NavLink
                to="/profile"
                end
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                aria-label="HOME"
              >
                <HomeIcon className="tab-icon" aria-hidden="true" />
                {!openAction && <span className="tab-label">{t("בית")}</span>}
              </NavLink>
              <NavLink
                to="/leagues"
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                aria-label="LEAGUES"
              >
                <TrophyIcon className="tab-icon" aria-hidden="true" />
                {!openAction && <span className="tab-label">{t("ליגות")}</span>}
                {hasOtherLeagueActivity && <span className="tab-dot" aria-hidden="true" />}
              </NavLink>
              <NavLink
                to="/needs-you"
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                aria-label="MATCHES"
              >
                <RanksIcon className="tab-icon" aria-hidden="true" />
                {!openAction && <span className="tab-label">{t("משחקים")}</span>}
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
                        <span dir="auto" style={{ unicodeBidi: "isolate" }}>{part}</span>
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
    </div>
  );
}
