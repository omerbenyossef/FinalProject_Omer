import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import AuthShell from "../AuthShell.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);
  const { loginWithToken } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const data = await api.login({ email, password });
      loginWithToken(data.access_token, data.user);
      const redirect = searchParams.get("redirect");
      navigate(redirect || "/profile");
    } catch (err) {
      setError(err.message);
    } finally {
      clearTimeout(slowTimer);
      setSubmitting(false);
      setSlow(false);
    }
  }

  return (
    <AuthShell>
      <div className="card form-card">
        <h1>{t("כניסה")}</h1>
        <form onSubmit={handleSubmit}>
          <label>
            {t("אימייל")}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            {t("סיסמה")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{t(error)}</p>}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? t("מתחבר...") : t("כניסה")}
          </button>
          {slow && <p className="muted">{t("השרת מתעורר, זה עשוי לקחת עד דקה בפעם הראשונה...")}</p>}
        </form>
        <p className="muted" style={{ marginTop: 10 }}>
          <Link to="/forgot-password">{t("שכחתי סיסמה")}</Link>
        </p>
        <p className="muted">
          {t("אין לך חשבון?")}{" "}
          <Link
            to={
              searchParams.get("redirect")
                ? `/register?redirect=${encodeURIComponent(searchParams.get("redirect"))}`
                : "/register"
            }
          >
            {t("הרשמה")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
