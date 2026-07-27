import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { getTheme, setTheme } from "../theme.js";

export default function Settings() {
  const { user, updateUser } = useAuth();

  return (
    <div>
      <h1>הגדרות</h1>
      <EditProfileCard user={user} updateUser={updateUser} />
      <ThemeCard />
      <ChangePasswordCard />
    </div>
  );
}

function ThemeCard() {
  const [theme, setThemeState] = useState(getTheme());

  function choose(value) {
    setTheme(value);
    setThemeState(value);
  }

  return (
    <section className="card">
      <h2>מראה</h2>
      <div className="segmented" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={`segmented-btn${theme === "system" ? " active" : ""}`}
          onClick={() => choose("system")}
        >
          אוטומטי
        </button>
        <button
          type="button"
          className={`segmented-btn${theme === "light" ? " active" : ""}`}
          onClick={() => choose("light")}
        >
          בהיר
        </button>
        <button
          type="button"
          className={`segmented-btn${theme === "dark" ? " active" : ""}`}
          onClick={() => choose("dark")}
        >
          כהה
        </button>
      </div>
    </section>
  );
}

function EditProfileCard({ user, updateUser }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [age, setAge] = useState(user?.age ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    <section className="card">
      <div className="settings-row">
        <div>
          <h2>פרופיל</h2>
          <p className="muted">{user?.name}</p>
        </div>
        {!editing && (
          <button type="button" className="btn-secondary" onClick={openEditor}>
            ערוך
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <label>
            שם מלא
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            גיל
            <input
              type="number"
              min="1"
              max="120"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="inline-form">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "שומר..." : "שמור"}
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              ביטול
            </button>
          </div>
        </form>
      )}
      {!editing && message && <p className="muted">{message}</p>}
    </section>
  );
}

function ChangePasswordCard() {
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    <section className="card">
      <div className="settings-row">
        <div>
          <h2>שינוי סיסמה</h2>
          <p className="muted">••••••••</p>
        </div>
        {!editing && (
          <button type="button" className="btn-secondary" onClick={openEditor}>
            שנה סיסמה
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <label>
            סיסמה נוכחית
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            סיסמה חדשה
            <input
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="inline-form">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "מעדכן..." : "עדכן סיסמה"}
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              ביטול
            </button>
          </div>
        </form>
      )}
      {!editing && message && <p className="muted">{message}</p>}
    </section>
  );
}
