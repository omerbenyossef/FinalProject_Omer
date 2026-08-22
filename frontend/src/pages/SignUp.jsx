import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";

const MIN_PASSWORD_LENGTH = 8;

function parseRadius(raw) {
  const match = raw.match(/[\d.]+/);
  if (!match) return null;
  const value = parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [area, setArea] = useState("");
  const [radius, setRadius] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);
  const { loginWithToken } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const strengthPct = Math.min(100, Math.round((password.length / 16) * 100));

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = {};
    if (!name.trim()) errors.name = t("נא להזין שם");
    if (!email.trim()) errors.email = t("נא להזין אימייל");
    if (password.length < MIN_PASSWORD_LENGTH) errors.password = t("הסיסמה חייבת להכיל 8 תווים לפחות");
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const data = await api.register({
        name,
        email,
        password,
        area: area.trim() || null,
        travel_radius_km: radius.trim() ? parseRadius(radius) : null,
      });
      loginWithToken(data.access_token, data.user);
      const friendlyToken = searchParams.get("friendly");
      if (friendlyToken) {
        try {
          await api.redeemFriendlyInviteLink(friendlyToken);
        } catch {
          /* invite link may be invalid or already used — registration itself still succeeded */
        }
      }
      const redirect = searchParams.get("redirect");
      navigate(redirect || "/profile");
    } catch (err) {
      setFieldErrors({ email: t(err.message) });
    } finally {
      clearTimeout(slowTimer);
      setSubmitting(false);
      setSlow(false);
    }
  }

  return (
    <div className="signscreen signscreen-signup">
      <h1 className="signscreen-title">{t("שלושה שדות ואתם בפנים")}</h1>

      <form className="signscreen-form" onSubmit={handleSubmit} noValidate>
        <div className="signfield">
          <label className="signfield-label signfield-label-name" htmlFor="signup-name" dir="ltr">
            {t("NAME")}
          </label>
          <input
            id="signup-name"
            className="signfield-input signfield-input-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="signfield-help" dir="ltr">
            {t("THIS IS THE NAME IN THE STANDINGS")}
          </p>
          {fieldErrors.name && <p className="signfield-error">{fieldErrors.name}</p>}
        </div>

        <div className="signfield">
          <label className="signfield-label" htmlFor="signup-email" dir="ltr">
            {t("EMAIL")}
          </label>
          <input
            id="signup-email"
            className="signfield-input signfield-input-email signfield-input-small"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldErrors.email && <p className="signfield-error">{fieldErrors.email}</p>}
        </div>

        <div className="signfield">
          <label className="signfield-label" htmlFor="signup-password" dir="ltr">
            {t("PASSWORD")}
          </label>
          <div className="signfield-password-wrap">
            <input
              id="signup-password"
              className="signfield-input signfield-input-password signfield-input-small"
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
          <div className="signfield-strength">
            <span className="signfield-strength-track">
              <span className="signfield-strength-fill" style={{ width: `${strengthPct}%` }} />
            </span>
            <span className="signfield-strength-label" dir="ltr">
              {t("8+ CHARACTERS")}
            </span>
          </div>
          {fieldErrors.password && <p className="signfield-error">{fieldErrors.password}</p>}
        </div>

        <div className="signfield">
          <label className="signfield-label" dir="ltr">
            {t("WHERE YOU PLAY")}
          </label>
          <div className="signfield-where-row" dir="ltr">
            <input
              className="signfield-input signfield-input-small signfield-where-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder={t("RAMAT GAN")}
            />
            <input
              className="signfield-input signfield-input-small signfield-where-radius"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              placeholder={t("15 KM")}
            />
          </div>
          <p className="signfield-help" dir="ltr">
            {t("USED TO SUGGEST LEAGUES NEAR YOU")}
          </p>
        </div>

        <button type="submit" className="btn-bright" disabled={submitting}>
          {submitting ? t("נרשם...") : t("פתיחת חשבון")}
        </button>
        {slow && <p className="muted signscreen-slow">{t("השרת מתעורר, זה עשוי לקחת עד דקה בפעם הראשונה...")}</p>}
      </form>

      <p className="signscreen-fineprint" dir="ltr">
        {t("NEXT · 6 QUESTIONS ABOUT YOUR LEVEL · BY CONTINUING YOU ACCEPT THE TERMS")}
      </p>

      <p className="signscreen-footer">
        {t("כבר יש לך חשבון?")}{" "}
        <Link
          to={
            searchParams.get("redirect")
              ? `/signin?redirect=${encodeURIComponent(searchParams.get("redirect"))}`
              : "/signin"
          }
        >
          {t("התחברות")}
        </Link>
      </p>
    </div>
  );
}
