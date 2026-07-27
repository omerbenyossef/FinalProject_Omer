import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { loginWithToken } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.register({ name, email, password });
      loginWithToken(data.access_token, data.user);
      const redirect = searchParams.get("redirect");
      navigate(redirect || "/profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card form-card">
      <h1>{t("הרשמה")}</h1>
      <form onSubmit={handleSubmit}>
        <label>
          {t("שם מלא")}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {t("אימייל")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          {t("סיסמה")}
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
          {submitting ? t("נרשם...") : t("הרשמה")}
        </button>
      </form>
      <p className="muted">
        {t("כבר יש לך חשבון?")}{" "}
        <Link
          to={
            searchParams.get("redirect")
              ? `/login?redirect=${encodeURIComponent(searchParams.get("redirect"))}`
              : "/login"
          }
        >
          {t("כניסה")}
        </Link>
      </p>
    </div>
  );
}
