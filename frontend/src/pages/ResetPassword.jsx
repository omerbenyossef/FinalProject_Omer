import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="card form-card">
        <h1>קישור לא תקין</h1>
        <p className="muted">
          הקישור חסר או שגוי. אפשר לבקש קישור חדש <Link to="/forgot-password">כאן</Link>.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card form-card">
        <h1>הסיסמה עודכנה</h1>
        <p className="muted" style={{ marginBottom: 14 }}>
          אפשר עכשיו להתחבר עם הסיסמה החדשה.
        </p>
        <button
          type="button"
          className="btn-primary"
          style={{ width: "100%" }}
          onClick={() => navigate("/login")}
        >
          מעבר לכניסה
        </button>
      </div>
    );
  }

  return (
    <div className="card form-card">
      <h1>איפוס סיסמה</h1>
      <form onSubmit={handleSubmit}>
        <label>
          סיסמה חדשה
          <input
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "מעדכן..." : "עדכן סיסמה"}
        </button>
      </form>
    </div>
  );
}
