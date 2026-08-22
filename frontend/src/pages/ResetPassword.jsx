import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import AuthShell from "../AuthShell.jsx";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();
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
      <AuthShell>
        <div className="form-card">
          <h1>{t("קישור לא תקין")}</h1>
          <p className="muted">
            {t("הקישור חסר או שגוי. אפשר לבקש קישור חדש")} <Link to="/forgot-password">{t("כאן")}</Link>.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <div className="form-card">
          <h1>{t("הסיסמה עודכנה")}</h1>
          <p className="muted" style={{ marginBottom: 14 }}>
            {t("אפשר עכשיו להתחבר עם הסיסמה החדשה.")}
          </p>
          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%" }}
            onClick={() => navigate("/signin")}
          >
            {t("מעבר לכניסה")}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="form-card">
        <h1>{t("איפוס סיסמה")}</h1>
        <form onSubmit={handleSubmit}>
          <label>
            {t("סיסמה חדשה")}
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{t(error)}</p>}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? t("מעדכן...") : t("עדכן סיסמה")}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
