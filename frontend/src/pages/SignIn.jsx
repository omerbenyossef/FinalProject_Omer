import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import GoogleSignInButton from "../GoogleSignInButton.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useSplashDone } from "../SplashContext.jsx";

/* Two doors. Google is the short one — signing in and signing up are the
   same tap, and which of the two it was is the server's business. The email
   and password below it exist because a door that depends on nobody else's
   service being reachable is the one that always opens. */
export default function SignIn() {
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { user, loading, loginWithToken } = useAuth();
  const { t } = useLanguage();
  const splashDone = useSplashDone();
  const [searchParams] = useSearchParams();

  // Whoever is already signed in is done here. The Google button only hands a
  // token to the auth context, so without this the player stays logged in and
  // looking at the sign-in screen.
  if (!loading && user) {
    // Old-style invite links (/signup?friendly=TOKEN) are still in people's
    // chats and now land here. The invitation screen says what became of one
    // either way, so hand it over rather than redeeming blind.
    const friendly = searchParams.get("friendly");
    if (friendly) return <Navigate to={`/friendly/invite/${friendly}`} replace />;
    return <Navigate to={searchParams.get("redirect") || "/profile"} replace />;
  }

  const redirectSuffix = searchParams.get("redirect")
    ? `?redirect=${encodeURIComponent(searchParams.get("redirect"))}`
    : "";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("נא להזין אימייל וסיסמה");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const data = await api.login({ email: email.trim(), password });
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

      {/* Only once the splash is off screen, so Google's script isn't asked to
          draw into a box that is still hidden. */}
      {splashDone && (
        <div className="signscreen-door">
          <GoogleSignInButton onError={setError} />
          {error && <p className="signfield-error signscreen-door-error">{t(error)}</p>}

          {/* The second door. Google is the shorter way in and stays on top,
              but a door that depends on nobody else's service being reachable
              is the one that always opens — a blocked popup, a browser that
              eats third-party frames, or Google simply having a bad morning
              used to mean nobody could get in at all. */}
          <div className="signscreen-or" aria-hidden="true">
            <span />
            <em>{t("או")}</em>
            <span />
          </div>

          <form className="signscreen-form" onSubmit={handleSubmit} noValidate>
            <div className="signfield">
              <label className="signfield-label" htmlFor="signin-email" dir="ltr">
                EMAIL
              </label>
              <input
                id="signin-email"
                className="signfield-input signfield-input-email"
                type="email"
                autoComplete="username"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="signfield">
              <div className="signfield-label-row" dir="ltr">
                <label className="signfield-label" htmlFor="signin-password">
                  PASSWORD
                </label>
                {/* Carry the address over: somebody who already typed it here
                    should not have to identify themselves twice. */}
                <Link
                  className="signscreen-inline-link"
                  to={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
                >
                  {t("שכחתי סיסמה")}
                </Link>
              </div>
              <div className="signfield-password-wrap">
                <input
                  id="signin-password"
                  className="signfield-input signfield-input-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
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
            </div>

            <button type="submit" className="btn-bright" disabled={submitting}>
              {submitting ? t("מתחבר...") : t("התחברות")}
            </button>
          </form>

          <p className="signscreen-footer">
            {t("אין לך חשבון?")}{" "}
            <Link to={`/signup${redirectSuffix}`}>{t("יצירת חשבון")}</Link>
          </p>
        </div>
      )}
    </div>
  );
}
