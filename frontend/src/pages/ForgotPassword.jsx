import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";

/* Asking for a reset link.
   The reply is the same sentence whether or not the address is registered —
   the difference is exactly what somebody fishing for accounts would be
   looking for, and the person who really owns the mailbox learns nothing
   from it they do not already know. */

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [sent, setSent] = useState("");
  const [devToken, setDevToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) {
      setError("נא להזין אימייל");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const data = await api.forgotPassword(email.trim());
      setSent(data.message);
      // Only ever present on a machine with no mail configured.
      if (data.reset_token) setDevToken(data.reset_token);
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
      </div>

      <div className="signscreen-door">
        <h1 className="signscreen-title">{t("שכחתי סיסמה")}</h1>
        {sent ? (
          <>
            <p className="signscreen-sent">{t(sent)}</p>
            {devToken && (
              <p className="signfield-hint" dir="ltr">
                <Link to={`/reset-password?token=${devToken}`}>/reset-password</Link>
              </p>
            )}
          </>
        ) : (
          <form className="signscreen-form" onSubmit={handleSubmit} noValidate>
            <p className="signscreen-door-note">
              {t("נשלח קישור לאיפוס הסיסמה לכתובת שהחשבון רשום בה.")}
            </p>
            <div className="signfield">
              <label className="signfield-label" htmlFor="forgot-email" dir="ltr">
                EMAIL
              </label>
              <input
                id="forgot-email"
                className="signfield-input signfield-input-email"
                type="email"
                autoComplete="username"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="signfield-error">{t(error)}</p>}
            <button type="submit" className="btn-bright" disabled={submitting}>
              {submitting ? t("שולח...") : t("שלחו לי קישור")}
            </button>
          </form>
        )}

        <p className="signscreen-footer">
          <Link to="/signin">{t("חזרה להתחברות")}</Link>
        </p>
      </div>
    </div>
  );
}
