import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { PersonIcon, SettingsIcon, TrophyIcon } from "./Icons.jsx";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/leagues" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          ליגת חובבים
        </Link>
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
          <NavLink to="/leagues" className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            <TrophyIcon className="tab-icon" aria-hidden="true" />
            ליגות
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            <PersonIcon className="tab-icon" aria-hidden="true" />
            פרופיל
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            <SettingsIcon className="tab-icon" aria-hidden="true" />
            הגדרות
          </NavLink>
        </nav>
      )}
    </div>
  );
}
