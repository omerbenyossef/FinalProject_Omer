import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import GoogleSignInButton from "../GoogleSignInButton.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";

/* Opening an account with an address and a password.
   Deliberately three fields and nothing else: a level, an area and a radius
   are all asked later, by the screens that actually need them, and an account
   nobody can open is worth less than one that knows nothing about you yet. */

const MIN_PASSWORD = 8;

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user, loading, loginWithToken } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  if (!loading && user) {
    return <Navigate to={searchParams.get("redirect") || "/profile"} replace />;
  }

  const redirectSuffix = searchParams.get("redirect")
    ? `?redirect=${encodeURIComponent(searchParams.get("redirect"))}`
    : "";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("נא להזין שם");
    if (!email.trim()) return setError("נא להזין אימייל");
    if (password.length < MIN_PASSWORD) return setError("הסיסמה חייבת להכיל 8 תווים לפחות");
    setError("");
    setSubmitting(true);
    try {
      const data = await api.register({ name: name.trim(), email: email.trim(), password });
      loginWithToken(data.access_token, data.user);
      navigate(searchParams.get("redirect") || "/profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
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

      <div className="signscreen-door">
        <GoogleSignInButton onError={setError} />

        <div className="signscreen-or" aria-hidden="true">
          <span />
          <em>{t("או")}</em>
          <span />
        </div>

        <form className="signscreen-form" onSubmit={handleSubmit} noValidate>
          <div className="signfield">
            <label className="signfield-label" htmlFor="signup-name">
              {t("שם")}
            </label>
            <input
              id="signup-name"
              className="signfield-input"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="signfield">
            <label className="signfield-label" htmlFor="signup-email" dir="ltr">
              EMAIL
            </label>
            <input
              id="signup-email"
              className="signfield-input signfield-input-email"
              type="email"
              autoComplete="username"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="signfield">
            <label className="signfield-label" htmlFor="signup-password" dir="ltr">
              PASSWORD
            </label>
            <div className="signfield-password-wrap">
              <input
                id="signup-password"
                className="signfield-input signfield-input-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="signfield-show"
                onClick={() => setShowPassword((v) => !v)}
                dir="ltr"
              >
                {showPassword ? t("הסתר") : t("הצג")}
              </button>
            </div>
            <p className="signfield-hint">{t("לפחות 8 תווים")}</p>
          </div>

          {error && <p className="signfield-error">{t(error)}</p>}

          <button type="submit" className="btn-bright" disabled={submitting}>
            {submitting ? t("נרשם...") : t("יצירת חשבון")}
          </button>
        </form>

        <p className="signscreen-footer">
          {t("כבר יש לך חשבון?")} <Link to={`/signin${redirectSuffix}`}>{t("התחברות")}</Link>
        </p>
      </div>
    </div>
  );
}
