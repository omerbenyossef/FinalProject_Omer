import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import AuthShell from "../AuthShell.jsx";
import { SkeletonBar } from "../Skeleton.jsx";

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  // Whatever was already typed on the sign-in screen: if it names a real
  // account there's nothing left to ask, so this screen doesn't stop here.
  const handedOver = (searchParams.get("email") ?? "").trim();
  const [email, setEmail] = useState(handedOver);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(handedOver !== "");
  const { t } = useLanguage();
  const navigate = useNavigate();
  const triedRef = useRef(false);

  // Returns true once the request has been answered and this screen is done
  // with — either it moved on, or it has something to say.
  const request = useCallback(
    async (address) => {
      const data = await api.forgotPassword(address);
      // With no mail configured the server hands the token back instead of
      // sending it, so go straight on to the new password.
      if (data.reset_token) {
        navigate(`/reset-password?token=${encodeURIComponent(data.reset_token)}`, { replace: true });
        return true;
      }
      return data.message;
    },
    [navigate]
  );

  useEffect(() => {
    if (triedRef.current || !handedOver) return;
    triedRef.current = true;
    (async () => {
      try {
        const result = await request(handedOver);
        // No token means no account under that address (or mail is configured
        // and a link went out) — either way the address needs looking at, so
        // fall back to the form with it filled in.
        if (result !== true) setNotice(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setSkipping(false);
      }
    })();
  }, [handedOver, request]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const result = await request(email);
      // Whatever the server answers, the form stays: the address may simply
      // need correcting, and a screen with nothing on it but a sentence is a
      // dead end.
      if (result !== true) setNotice(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="form-card">
        <h1>{t("שכחתי סיסמה")}</h1>
        {skipping ? (
          <>
            <p className="muted" style={{ marginBottom: 14 }}>
              {t("רגע, בודקים את החשבון")}
            </p>
            <SkeletonBar height={44} />
          </>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 14 }}>
              {t("הזינו את כתובת האימייל של החשבון כדי להגדיר סיסמה חדשה")}
            </p>
            <form onSubmit={handleSubmit}>
              <label>
                {t("אימייל")}
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              {notice && <p className="muted">{t(notice)}</p>}
              {error && <p className="error">{t(error)}</p>}
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? t("שולח...") : t("המשך")}
              </button>
            </form>
          </>
        )}
        <p className="muted" style={{ marginTop: 14 }}>
          <Link to="/signin">{t("חזרה לכניסה")}</Link>
        </p>
      </div>
    </AuthShell>
  );
}
