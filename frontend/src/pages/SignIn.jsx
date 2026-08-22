import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);
  const { loginWithToken } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirectSuffix = searchParams.get("redirect")
    ? `?redirect=${encodeURIComponent(searchParams.get("redirect"))}`
    : "";

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!email.trim()) errors.email = t("נא להזין אימייל");
    if (!password) errors.password = t("נא להזין סיסמה");
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const data = await api.login({ email, password });
      loginWithToken(data.access_token, data.user);
      const redirect = searchParams.get("redirect");
      navigate(redirect || "/profile");
    } catch (err) {
      setFieldErrors({ password: t(err.message) });
    } finally {
      clearTimeout(slowTimer);
      setSubmitting(false);
      setSlow(false);
    }
  }

  return (
    <div className="signscreen">
      <div className="signscreen-brand">
        <div className="signscreen-wordmark">Rally</div>
        <p className="signscreen-tagline" dir="ltr">
          <span>{t("TENNIS LEAGUES FOR PEOPLE")}</span>
          <span>{t("WHO ALREADY PLAY")}</span>
        </p>
      </div>

      <form className="signscreen-form" onSubmit={handleSubmit} noValidate>
        <div className="signfield">
          <label className="signfield-label" htmlFor="signin-email" dir="ltr">
            {t("EMAIL")}
          </label>
          <input
            id="signin-email"
            className="signfield-input signfield-input-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldErrors.email && <p className="signfield-error">{fieldErrors.email}</p>}
        </div>

        <div className="signfield">
          <div className="signfield-label-row" dir="ltr">
            <label className="signfield-label" htmlFor="signin-password">
              {t("PASSWORD")}
            </label>
            <Link className="signscreen-inline-link" to="/forgot-password">
              {t("FORGOT")}
            </Link>
          </div>
          <div className="signfield-password-wrap">
            <input
              id="signin-password"
              className="signfield-input signfield-input-password"
              type={showPassword ? "text" : "password"}
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="signfield-show"
              onClick={() => setShowPassword((s) => !s)}
              dir="ltr"
            >
              {showPassword ? t("HIDE") : t("SHOW")}
            </button>
          </div>
          {fieldErrors.password && <p className="signfield-error">{fieldErrors.password}</p>}
        </div>

        <button type="submit" className="btn-bright" disabled={submitting}>
          {submitting ? t("מתחבר...") : t("התחברות")}
        </button>
        {slow && <p className="muted signscreen-slow">{t("השרת מתעורר, זה עשוי לקחת עד דקה בפעם הראשונה...")}</p>}
      </form>

      <p className="signscreen-footer">
        <span className="signscreen-footer-label" dir="ltr">
          {t("NEW HERE?")}
        </span>{" "}
        <Link to={`/signup${redirectSuffix}`}>{t("יצירת חשבון")}</Link>
      </p>
    </div>
  );
}
