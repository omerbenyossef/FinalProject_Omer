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
        {/* signin-logo-174a: the app tile, drawn inline — two colours and two
            paths, so the first screen that loads makes no extra request. The
            geometry is the app icon's (132a); if that changes, so does this. */}
        <span className="signscreen-mark" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="36" fill="#0e1116" />
            <path
              d="M36 36 Q58 60 36 84"
              fill="none"
              stroke="#c6f24e"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M84 36 Q62 60 84 84"
              fill="none"
              stroke="#c6f24e"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
        </span>
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
            {/* Carry the address over: someone who already typed it here
                shouldn't have to identify themselves twice. */}
            <Link
              className="signscreen-inline-link"
              to={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
            >
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
