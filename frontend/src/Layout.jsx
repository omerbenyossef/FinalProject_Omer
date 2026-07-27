import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import { PersonIcon, SettingsIcon, TrophyIcon } from "./Icons.jsx";

function BrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#16a34a" />
      <circle cx="24" cy="24" r="15" fill="#f5f7d4" stroke="#0b1220" strokeWidth="1.4" />
      <path d="M10 15 C 18 22, 18 26, 10 33" stroke="#0b1220" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M38 15 C 30 22, 30 26, 38 33" stroke="#0b1220" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { sports, selectedSportId, setSelectedSportId } = useSport();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/leagues" className="brand">
          <BrandMark />
          Rally
        </Link>

        {sports.length > 0 && (
          <select
            className="sport-switcher"
            value={selectedSportId ?? ""}
            onChange={(e) => setSelectedSportId(Number(e.target.value))}
          >
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.name}
              </option>
            ))}
          </select>
        )}

        <nav>
          {user ? (
            <button className="link-btn" onClick={handleLogout}>
              התנתקות
            </button>
          ) : (
            <>
              <Link to="/login">כניסה</Link>
              <Link to="/register">הרשמה</Link>
            </>
          )}
        </nav>
      </header>
      <main className="content">{children}</main>
      {user && (
        <nav className="tabbar">
          <div className="tabbar-inner">
            <NavLink
              to="/leagues"
              className={({ isActive }) => `tab${isActive ? " active" : ""}`}
              aria-label="ליגות"
            >
              <TrophyIcon className="tab-icon" aria-hidden="true" />
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) => `tab${isActive ? " active" : ""}`}
              aria-label="פרופיל"
            >
              <PersonIcon className="tab-icon" aria-hidden="true" />
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) => `tab${isActive ? " active" : ""}`}
              aria-label="הגדרות"
            >
              <SettingsIcon className="tab-icon" aria-hidden="true" />
            </NavLink>
          </div>
        </nav>
      )}
    </div>
  );
}
