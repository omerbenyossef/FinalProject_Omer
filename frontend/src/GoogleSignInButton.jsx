import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";

/* Google draws its own button — the wording, the mark and the sizes are theirs
   to decide, and a hand-drawn copy is both against their terms and the kind of
   thing that quietly stops matching. We give it a box and hand back whatever
   it puts in our hands.

   With no client id configured the whole thing renders nothing, so the app
   works exactly as it did before anyone set one up. */

// Google's own id for this app. It is public by design — it is in the button
// Google draws, in the page source, and in every request the browser makes —
// so it lives here rather than in a dashboard nobody remembers to fill in.
// VITE_GOOGLE_CLIENT_ID overrides it, for anyone running their own copy.
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

export default function GoogleSignInButton({ onError }) {
  const { t, language } = useLanguage();
  const { loginWithToken } = useAuth();
  const boxRef = useRef(null);
  const [failed, setFailed] = useState(false);
  // The callback closes over loginWithToken and onError, and Google keeps the
  // one it was initialized with — a ref keeps it pointing at the current ones.
  const handlers = useRef({ loginWithToken, onError });
  handlers.current = { loginWithToken, onError };

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            try {
              const data = await api.googleSignIn(credential);
              handlers.current.loginWithToken(data.access_token, data.user);
            } catch (err) {
              handlers.current.onError?.(err.message);
            }
          },
        });
        window.google.accounts.id.renderButton(boxRef.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          locale: language === "en" ? "en" : "he",
          // Google wants a number, and refuses anything over 400. The box is
          // full width, so measure it rather than guessing at a phone.
          width: Math.min(400, Math.round(boxRef.current.offsetWidth || 320)),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [language]);

  if (!CLIENT_ID) return null;
  return (
    <div className="gsi">
      <div className="gsi-box" ref={boxRef} />
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
