import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.login({ email, password });
      loginWithToken(data.access_token, data.user);
      navigate("/leagues");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card form-card">
      <h1>כניסה</h1>
      <form onSubmit={handleSubmit}>
        <label>
          אימייל
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          סיסמה
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "מתחבר..." : "כניסה"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 10 }}>
        <Link to="/forgot-password">שכחתי סיסמה</Link>
      </p>
      <p className="muted">
        אין לך חשבון? <Link to="/register">הרשמה</Link>
      </p>
    </div>
  );
}
