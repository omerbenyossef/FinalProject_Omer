import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { getExistingSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "../push.js";
import PageHelp from "../PageHelp.jsx";
import Toggle from "../Toggle.jsx";

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
      <header className="page-head">
        <div className="page-title-row">
          <h1>{t("הגדרות")}</h1>
          <PageHelp
            pageKey="settings"
            title="עמוד ההגדרות"
            text="כאן תוכלו לערוך את הפרופיל שלכם, לשנות סיסמה או אימייל, להפעיל התראות, ולשנות שפה או מראה."
          />
        </div>
        <div className="settings-chips">
          <LanguageChip />
        </div>
      </header>

      <div className="settings-section">
        <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
          <span>{t("חשבון")}</span>
        </div>
        <EditProfileRow user={user} updateUser={updateUser} />
        <ChangeEmailRow user={user} updateUser={updateUser} />
        <ChangePasswordRow />
      </div>

      <div className="settings-section">
        <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
          <span>{t("התראות")}</span>
        </div>
        <NotificationsRow />
      </div>

      <div className="settings-section">
        <div className="settings-detail-row">
          <div>
            <div className="settings-detail-title">{t("יציאה מהחשבון")}</div>
            <div className="settings-detail-value mono" dir="ltr">
              {user?.email}
            </div>
          </div>
          <button type="button" className="settings-detail-action danger" onClick={handleLogout}>
            {t("התנתקות")}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
          <span>{t("אזור מסוכן")}</span>
        </div>
        <DeleteAccountRow />
      </div>
    </div>
  );
}

function LanguageChip() {
  const { language, setLanguage } = useLanguage();

  function cycle() {
    setLanguage(language === "en" ? "he" : "en");
  }

  return (
    <button type="button" className="settings-chip" onClick={cycle}>
      {language === "en" ? "Language: English" : "שפה: עברית"}
    </button>
  );
}

function EditProfileRow({ user, updateUser }) {
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
    <div className="settings-detail-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="settings-detail-title">{t("פרופיל")}</div>
          <div className="settings-detail-value">
            {user?.name}
            {user?.age ? ` · ${t("גיל {age}", { age: user.age })}` : ""}
          </div>
        </div>
        {!editing && (
          <button type="button" className="settings-detail-action" onClick={openEditor}>
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

function ChangeEmailRow({ user, updateUser }) {
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
    <div className="settings-detail-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="settings-detail-title">{t("אימייל")}</div>
          <div className="settings-detail-value mono" dir="ltr">
            {user?.email}
          </div>
        </div>
        {!editing && (
          <button type="button" className="settings-detail-action" onClick={openEditor}>
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

function DeleteAccountRow() {
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();
  const { logout } = useAuth();
  const navigate = useNavigate();

  function openEditor() {
    setPassword("");
    setError("");
    setEditing(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.deleteAccount(password);
      logout();
      navigate("/login");
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="settings-detail-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="settings-detail-title">{t("מחיקת חשבון")}</div>
          <div className="settings-detail-value">{t("מחיקה סופית של החשבון וכל הנתונים שלך")}</div>
        </div>
        {!editing && (
          <button type="button" className="settings-detail-action danger" onClick={openEditor}>
            {t("מחק חשבון")}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <p className="error">
            {t(
              "הפעולה בלתי הפיכה. החשבון שלך יימחק, ולא תוכל/י להתחבר אליו שוב. משחקים שכבר הושלמו יישארו בהיסטוריה של היריבים שלך, בלי הפרטים האישיים שלך."
            )}
          </p>
          <label>
            {t("סיסמה")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{t(error)}</p>}
          <div className="inline-form">
            <button type="submit" className="btn-primary btn-danger" disabled={submitting}>
              {submitting ? t("מוחק...") : t("מחק את החשבון שלי לצמיתות")}
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              {t("ביטול")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function NotificationsRow() {
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
    <div className="settings-detail-row">
      <div>
        <div className="settings-detail-title">{t("התראות במכשיר")}</div>
        <div className="settings-detail-value">
          {!supported ? t("לא נתמך בדפדפן הזה") : subscribed ? t("מופעלות") : t("כבויות")}
        </div>
        {error && <p className="error">{t(error)}</p>}
      </div>
      {supported && !loading && (
        <Toggle checked={subscribed} onChange={handleToggle} disabled={submitting} label={t("התראות במכשיר")} />
      )}
    </div>
  );
}

function ChangePasswordRow() {
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
    <div className="settings-detail-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="settings-detail-title">{t("סיסמה")}</div>
          <div className="settings-detail-value mono">••••••••</div>
        </div>
        {!editing && (
          <button type="button" className="settings-detail-action" onClick={openEditor}>
            {t("שנה")}
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
