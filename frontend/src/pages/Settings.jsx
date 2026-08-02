import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { getTheme, setTheme } from "../theme.js";
import { getExistingSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "../push.js";
import PageHelp from "../PageHelp.jsx";

const THEME_ORDER = ["system", "light", "dark"];
const THEME_LABELS = { system: "אוטומטי", light: "בהיר", dark: "כהה" };

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1>{t("הגדרות")}</h1>
          <PageHelp
            pageKey="settings"
            title="עמוד ההגדרות"
            text="כאן תוכלו לערוך את הפרופיל שלכם, לשנות סיסמה או אימייל, להפעיל התראות, ולשנות שפה או מראה."
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ThemeToggleButton />
          <LanguageToggleButton />
        </div>
      </div>
      <div className="flat-sections">
        <EditProfileCard user={user} updateUser={updateUser} />
        <ChangeEmailCard user={user} updateUser={updateUser} />
        <ChangePasswordCard />
        <NotificationsCard />
        <div className="flat-section">
          <div className="settings-row">
            <div>
              <h2>{t("יציאה מהחשבון")}</h2>
              <p className="muted">{user?.email}</p>
            </div>
            <button type="button" className="link-btn" style={{ color: "var(--danger)" }} onClick={handleLogout}>
              {t("התנתקות")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeToggleButton() {
  const [theme, setThemeState] = useState(getTheme());
  const { t } = useLanguage();

  function cycle() {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button type="button" className="btn-secondary btn-small" onClick={cycle}>
      {t("תצוגה: " + THEME_LABELS[theme])}
    </button>
  );
}

function LanguageToggleButton() {
  const { language, setLanguage } = useLanguage();

  function cycle() {
    setLanguage(language === "en" ? "he" : "en");
  }

  return (
    <button type="button" className="btn-secondary btn-small" onClick={cycle}>
      {language === "en" ? "Language: English" : "שפה: עברית"}
    </button>
  );
}

function EditProfileCard({ user, updateUser }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [age, setAge] = useState(user?.age ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();

  function openEditor() {
    setName(user?.name || "");
    setAge(user?.age ?? "");
    setMessage("");
    setError("");
    setEditing(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const updated = await api.updateProfile(name, age === "" ? null : Number(age));
      updateUser(updated);
      setMessage("הפרופיל עודכן בהצלחה");
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flat-section">
      <div className="settings-row">
        <div>
          <h2>{t("פרופיל")}</h2>
          <p className="muted">{user?.name}</p>
        </div>
        {!editing && (
          <button type="button" className="link-btn" onClick={openEditor}>
            {t("ערוך")}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <label>
            {t("שם מלא")}
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            {t("גיל")}
            <input
              type="number"
              min="1"
              max="120"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </label>
          {error && <p className="error">{t(error)}</p>}
          <div className="inline-form">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t("שומר...") : t("שמור")}
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              {t("ביטול")}
            </button>
          </div>
        </form>
      )}
      {!editing && message && <p className="muted">{t(message)}</p>}
    </div>
  );
}

function ChangeEmailCard({ user, updateUser }) {
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();

  function openEditor() {
    setCurrentPassword("");
    setNewEmail(user?.email || "");
    setMessage("");
    setError("");
    setEditing(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const updated = await api.changeEmail(currentPassword, newEmail);
      updateUser(updated);
      setMessage("האימייל עודכן בהצלחה");
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flat-section">
      <div className="settings-row">
        <div>
          <h2>{t("אימייל")}</h2>
          <p className="muted">{user?.email}</p>
        </div>
        {!editing && (
          <button type="button" className="link-btn" onClick={openEditor}>
            {t("שנה אימייל")}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <label>
            {t("אימייל חדש")}
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </label>
          <label>
            {t("סיסמה נוכחית")}
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{t(error)}</p>}
          <div className="inline-form">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t("מעדכן...") : t("עדכן אימייל")}
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              {t("ביטול")}
            </button>
          </div>
        </form>
      )}
      {!editing && message && <p className="muted">{t(message)}</p>}
    </div>
  );
}

function NotificationsCard() {
  const { t } = useLanguage();
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPushSupported()) {
      setSupported(false);
      setLoading(false);
      return;
    }
    getExistingSubscription()
      .then((sub) => setSubscribed(!!sub))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle() {
    setError("");
    setSubmitting(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        if (Notification.permission === "denied") {
          setError("ההתראות חסומות בדפדפן, יש לאשר אותן בהגדרות הדפדפן");
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("צריך לאשר התראות כדי להפעיל אותן");
          return;
        }
        await subscribeToPush();
        setSubscribed(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flat-section">
      <div className="settings-row">
        <div>
          <h2>{t("התראות")}</h2>
          <p className="muted">
            {!supported
              ? t("לא נתמך בדפדפן הזה")
              : subscribed
              ? t("מופעלות")
              : t("כבויות")}
          </p>
        </div>
        {supported && !loading && (
          <button type="button" className="link-btn" onClick={handleToggle} disabled={submitting}>
            {subscribed ? t("כבה") : t("הפעל")}
          </button>
        )}
      </div>
      {error && <p className="error">{t(error)}</p>}
    </div>
  );
}

function ChangePasswordCard() {
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();

  function openEditor() {
    setCurrentPassword("");
    setNewPassword("");
    setMessage("");
    setError("");
    setEditing(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const data = await api.changePassword(currentPassword, newPassword);
      setMessage(data.message);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flat-section">
      <div className="settings-row">
        <div>
          <h2>{t("שינוי סיסמה")}</h2>
          <p className="muted">••••••••</p>
        </div>
        {!editing && (
          <button type="button" className="link-btn" onClick={openEditor}>
            {t("שנה סיסמה")}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <label>
            {t("סיסמה נוכחית")}
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            {t("סיסמה חדשה")}
            <input
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{t(error)}</p>}
          <div className="inline-form">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t("מעדכן...") : t("עדכן סיסמה")}
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              {t("ביטול")}
            </button>
          </div>
        </form>
      )}
      {!editing && message && <p className="muted">{t(message)}</p>}
    </div>
  );
}
