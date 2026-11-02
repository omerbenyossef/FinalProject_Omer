import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import GoogleSignInButton from "../GoogleSignInButton.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useSplashDone } from "../SplashContext.jsx";

/* The only door. There are no passwords in Rally: signing in and signing up
   are the same tap, and which of the two it was is the server's business, not
   a choice to put in front of someone who just wants to play tennis. */
export default function SignIn() {
  const [error, setError] = useState("");
  const { user, loading } = useAuth();
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
          <p className="signscreen-door-note">
            {t("ההתחברות הראשונה פותחת לך חשבון. אין סיסמה לזכור.")}
          </p>
        </div>
      )}
    </div>
  );
}
