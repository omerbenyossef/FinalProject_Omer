import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";

/* signin-google-184b — our own button, not Google's.

   Google's renderButton draws into an iframe: a white plate, a white disc
   behind the G, and no say over the height, the radius or the typeface. Next
   to this app's own 48px pill it looked like something pasted on.

   So the real button is ours, and Google's is still rendered — into a box
   nobody can see — purely to be clicked. The alternative is the authorization
   code flow, which gives a properly headless API but needs the client secret
   kept on the server; this keeps the browser-side token exchange exactly as it
   was. If the hidden button ever stops being findable, the fallback is to show
   Google's own rather than to have a button that does nothing. */

const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "803410034957-02cud2sjitn1ln67rdt2tup1j90jb8vk.apps.googleusercontent.com";
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({ onError }) {
  const { t } = useLanguage();
  const { loginWithToken } = useAuth();
  const hiddenRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Shown only if the hidden button can't be found — Google's own, plate and
  // all, is still better than a dead button.
  const [showReal, setShowReal] = useState(false);
  const handlers = useRef({ loginWithToken, onError });
  handlers.current = { loginWithToken, onError };

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !hiddenRef.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            try {
              const data = await api.googleSignIn(credential);
              handlers.current.loginWithToken(data.access_token, data.user);
            } catch (err) {
              setConnecting(false);
              handlers.current.onError?.(err.message);
            }
          },
        });
        window.google.accounts.id.renderButton(hiddenRef.current, {
          type: "standard",
          size: "large",
          width: 320,
        });
        setReady(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Closing Google's popup fires no callback, so "connecting" would sit there
  // for good. Focus coming back to the window is the only signal there is.
  useEffect(() => {
    if (!connecting) return;
    let timer = null;
    const onFocus = () => {
      timer = setTimeout(() => setConnecting(false), 1200);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) clearTimeout(timer);
    };
  }, [connecting]);

  function handleClick() {
    const real = hiddenRef.current?.querySelector('div[role="button"], button');
    if (!real) {
      setShowReal(true);
      return;
    }
    setConnecting(true);
    real.click();
  }

  if (!CLIENT_ID) return null;
  return (
    <div className="gsi">
      <div className={`gsi-hidden${showReal ? " is-shown" : ""}`} ref={hiddenRef} />
      {!showReal && (
        <button
          type="button"
          className="gbtn"
          disabled={!ready || connecting}
          onClick={handleClick}
        >
          {connecting ? (
            t("מתחבר…")
          ) : (
            <>
              <GoogleG />
              {t("המשך עם Google")}
            </>
          )}
        </button>
      )}
      {/* Ad blockers and locked-down networks block Google's script outright,
          and an empty gap where a button should be explains nothing. */}
      {failed && <p className="gsi-failed">{t("לא הצלחנו לטעון את ההתחברות עם גוגל")}</p>}
      <div className="gsi-or">
        <span />
        <span className="gsi-or-word">{t("או")}</span>
        <span />
      </div>
    </div>
  );
}
