import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.forgotPassword(email);
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card form-card">
      <h1>שכחתי סיסמה</h1>
      <p className="muted" style={{ marginBottom: 14 }}>
        הזינו את כתובת האימייל שלכם ונשלח אליכם קישור לאיפוס הסיסמה
      </p>
      {message ? (
        <p className="muted">{message}</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            אימייל
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "שולח..." : "שלח קישור לאיפוס"}
          </button>
        </form>
      )}
      <p className="muted" style={{ marginTop: 14 }}>
        <Link to="/login">חזרה לכניסה</Link>
      </p>
    </div>
  );
}
