import { Link, NavLink, useLocation } from "react-router-dom";
import { mediaUrl } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import { usePairs } from "./PairContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { useOpenAction } from "./OpenActionContext.jsx";
import { BellIcon, HomeIcon, RanksIcon, TennisIcon } from "./Icons.jsx";
import InstallPrompt from "./InstallPrompt.jsx";
import PushPrompt from "./PushPrompt.jsx";
import Onboarding from "./Onboarding.jsx";
import SportSwitcher from "./SportSwitcher.jsx";
import PairSwitcher from "./PairSwitcher.jsx";

const AUTH_PATHS = ["/signin", "/signup", "/forgot-password", "/reset-password", "/privacy", "/terms"];

export default function Layout({ children }) {
  const { user } = useAuth();
  const { sports, selectedSportId } = useSport();
  const { activePairs, selectedPair, pairsAwaitingMe } = usePairs();
  const selectedSportPlaysInPairs = Boolean(
    sports.find((sport) => sport.id === selectedSportId)?.plays_in_pairs
  );
  const { t } = useLanguage();
  const location = useLocation();
  const { hasOtherLeagueActivity, unreadCount } = useOpenAction();
  const isAuthRoute = AUTH_PATHS.includes(location.pathname);
  // leaguerosterbeforejoin154b — the join screen owns the full height below
  // the topbar (its roster scrolls, its footer holds the only action), so the
  // tab bar would just be a second bottom bar competing with it.
  const isJoinPreview = /^\/leagues\/\d+\/preview$/.test(location.pathname);
  // ranks-entry-173 pushed the rankings over the profile with no tab and only
  // a back arrow out. 189b makes them the third tab, so the bar stays: a tab
  // that hides the bar it was tapped from strands the reader.
  // 183b: a screen that asks one question and offers two answers, reached from
  // the home screen and left by its own back arrow.
  const isNewMatch = location.pathname === "/new-match";

  if (isAuthRoute) {
    return <main className="content auth-content">{children}</main>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        {user ? (
          <>
            {/* 203b — the bell belongs beside the face, in the bar that is on
                every screen, not inside one screen's greeting. It used to be
                the home screen's own, which meant the one place you could
                find out something was waiting was the place that already
                showed you what. */}
            <div className="topbar-me">
              <Link to="/me" className="topbar-avatar" aria-label={t("פרופיל")}>
                {user.photo_url ? (
                  <img src={mediaUrl(user.photo_url)} alt="" />
                ) : (
                  user.name?.trim()?.[0] ?? "?"
                )}
              </Link>
              <Link to="/notifications" className="topbar-bell" aria-label={t("התראות")}>
                <BellIcon aria-hidden="true" />
                {unreadCount > 0 && <span className="topbar-bell-dot" aria-hidden="true" />}
              </Link>
            </div>
            <div className="wordmark-cluster">
              <span className="wordmark-rally">RALLY</span>
              {/* 187c: the sport is a button in the sport's own colour, not a
                  grey label with an invisible <select> over it. */}
              <SportSwitcher userId={user.id} />
              {/* In a pairs sport the player is always looking at the game
                  through one of their pairs, so which one sits next to the
                  sport. Nothing is shown until there is a choice to make. */}
              {selectedSportPlaysInPairs && activePairs.length === 0 && (
                <span className="wordmark-pair-wrap">
                  <span className="wordmark-pair-sep" aria-hidden="true">
                    ·
                  </span>
                  <Link to="/partners" className="wordmark-pair wordmark-pair--cta">
                    {pairsAwaitingMe.length > 0 ? t("הזמנה לצמד") : t("מצא שותף")}
                  </Link>
                </span>
              )}
              {activePairs.length > 0 && selectedPair && (
                <span className="wordmark-pair-wrap">
                  <span className="wordmark-pair-sep" aria-hidden="true">
                    ·
                  </span>
                  {/* The selected pair filters the whole app now — diary,
                      leagues, notifications, open items — so the switch is
                      worth a real control instead of a label. Its dot is the
                      safety net: when the pair you are not looking through
                      has something waiting, nothing disappears in silence. */}
                  <PairSwitcher />
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
            </nav>
          </>
        )}
      </header>
      {user && <Onboarding />}
      {user && <InstallPrompt />}
      {user && <PushPrompt />}
      <main className="content">{children}</main>
      {user && location.pathname !== "/ops" && !isJoinPreview && !isNewMatch && (
        <nav className="tabbar">
          <div className="tabbar-row">
            {/* One row, always the same width. It used to shrink to make
                room for a lime "REPORT VS …" bar on every screen; that bar is
                gone, and so is the shrinking — and the labels it used to
                squeeze out are always shown now. */}
            <div className="tabbar-inner">
              {/* my-profile-171a put the profile on the avatar in the header
                  and left HOME · LEAGUES · MATCHES here. 189b replaces the
                  middle one with the games hub and names the third for what
                  its icon has always been — RanksIcon — so that two tabs are
                  not both called "משחקים". /needs-you, which the third tab used
                  to open, keeps its entry on the home screen. */}
              <NavLink
                to="/profile"
                end
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                aria-label="HOME"
              >
                <HomeIcon className="tab-icon" aria-hidden="true" />
                <span className="tab-label">{t("בית")}</span>
              </NavLink>
              <NavLink
                to="/games"
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                aria-label="GAMES"
              >
                <TennisIcon className="tab-icon" aria-hidden="true" />
                <span className="tab-label">{t("משחקים")}</span>
                {hasOtherLeagueActivity && <span className="tab-dot" aria-hidden="true" />}
              </NavLink>
              <NavLink
                to="/ranks"
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
                aria-label="RANKING"
              >
                <RanksIcon className="tab-icon" aria-hidden="true" />
                <span className="tab-label">{t("דירוג")}</span>
              </NavLink>
            </div>

          </div>
        </nav>
      )}
    </div>
  );
}
