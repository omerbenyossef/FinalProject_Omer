import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import AuthShell from "../AuthShell.jsx";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.forgotPassword(email);
      // With no mail configured the server hands the token back instead of
      // sending it, so go straight on to the new password.
      if (data.reset_token) {
        navigate(`/reset-password?token=${encodeURIComponent(data.reset_token)}`, { replace: true });
        return;
      }
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="form-card">
        <h1>{t("שכחתי סיסמה")}</h1>
        <p className="muted" style={{ marginBottom: 14 }}>
          {t("הזינו את כתובת האימייל של החשבון כדי להגדיר סיסמה חדשה")}
        </p>
        {message ? (
          <p className="muted">{t(message)}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              {t("אימייל")}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            {error && <p className="error">{t(error)}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t("שולח...") : t("המשך")}
            </button>
          </form>
        )}
        <p className="muted" style={{ marginTop: 14 }}>
          <Link to="/signin">{t("חזרה לכניסה")}</Link>
        </p>
      </div>
    </AuthShell>
  );
}
