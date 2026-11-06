import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";

/* The other end of the link. The token in the address is the only proof
   there is, so it is spent the moment it works: the same link never opens
   the account twice, and a mailbox somebody else later reads holds nothing
   that still does. */

const MIN_PASSWORD = 8;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError("הסיסמה חייבת להכיל 8 תווים לפחות");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      // Straight to the door it just unlocked, rather than a dead end with
      // a "you may now sign in" on it.
      setTimeout(() => navigate("/signin"), 1200);
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
        <h1 className="signscreen-title">{t("סיסמה חדשה")}</h1>

        {!token ? (
          <p className="signfield-error">{t("קישור האיפוס אינו תקין או שפג תוקפו")}</p>
        ) : done ? (
          <p className="signscreen-sent">{t("הסיסמה עודכנה בהצלחה")}</p>
        ) : (
          <form className="signscreen-form" onSubmit={handleSubmit} noValidate>
            <div className="signfield">
              <label className="signfield-label" htmlFor="reset-password" dir="ltr">
                PASSWORD
              </label>
              <div className="signfield-password-wrap">
                <input
                  id="reset-password"
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
              {submitting ? t("שומר...") : t("שמור סיסמה")}
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
