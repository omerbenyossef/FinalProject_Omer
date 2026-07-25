import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";

export default function Settings() {
  const { user, updateUser } = useAuth();

  return (
    <div>
      <h1>הגדרות</h1>
      <EditNameCard user={user} updateUser={updateUser} />
      <ChangePasswordCard />
    </div>
  );
}

function EditNameCard({ user, updateUser }) {
  const [name, setName] = useState(user?.name || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const updated = await api.updateProfile(name);
      updateUser(updated);
      setMessage("השם עודכן בהצלחה");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <h2>עריכת שם</h2>
      <form onSubmit={handleSubmit}>
        <label>
          שם מלא
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "שומר..." : "שמור שם"}
        </button>
      </form>
    </section>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const data = await api.changePassword(currentPassword, newPassword);
      setMessage(data.message);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <h2>שינוי סיסמה</h2>
      <form onSubmit={handleSubmit}>
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
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "מעדכן..." : "עדכן סיסמה"}
        </button>
      </form>
    </section>
  );
}
