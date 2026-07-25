import { Link, useNavigate } from "react-router-dom";
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
          🏆 ליגת חובבים
        </Link>
        <nav>
          {user ? (
            <>
              <span className="muted">שלום, {user.name}</span>
              <button className="link-btn" onClick={handleLogout}>
                התנתקות
              </button>
            </>
          ) : (
            <>
              <Link to="/login">כניסה</Link>
              <Link to="/register">הרשמה</Link>
            </>
          )}
        </nav>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
