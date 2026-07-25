import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

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
            <span className="tab-icon" aria-hidden="true">🏆</span>
            ליגות
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            <span className="tab-icon" aria-hidden="true">👤</span>
            פרופיל
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            <span className="tab-icon" aria-hidden="true">⚙️</span>
            הגדרות
          </NavLink>
        </nav>
      )}
    </div>
  );
}
