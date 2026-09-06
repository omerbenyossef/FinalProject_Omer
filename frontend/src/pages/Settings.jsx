import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useSport } from "../SportContext.jsx";
import { getExistingSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "../push.js";
import PageHelp from "../PageHelp.jsx";
import Toggle from "../Toggle.jsx";
import RatingQuestionnaire from "../RatingQuestionnaire.jsx";

const PROVISIONAL_MATCHES = 3;

function monthAbbrev(dateStr) {
  return new Date(dateStr).toLocaleString("en-US", { month: "short" }).toUpperCase();
}

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { t } = useLanguage();
  const { selectedSportId, sports } = useSport();
  const navigate = useNavigate();
  const [myRatings, setMyRatings] = useState([]);
  const [retaking, setRetaking] = useState(false);

  function reloadRatings() {
    api
      .myRatings()
      .then(setMyRatings)
      .catch(() => {});
  }

  useEffect(() => {
    reloadRatings();
  }, []);

  function handleLogout() {
    logout();
    navigate("/signin");
  }

  const sportName = sports.find((s) => s.id === selectedSportId)?.name;
  const myRating = myRatings.find((r) => r.sport_id === selectedSportId) || null;

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
        <IdentityRow
          label={t("שם")}
          value={user?.name}
          required
          onSave={async (v) => updateUser(await api.updateProfile({ name: v }))}
        />
        <IdentityRow
          label={t("אזור")}
          value={user?.area}
          placeholder={t("לא הוגדר")}
          onSave={async (v) => updateUser(await api.updateProfile({ area: v }))}
        />
        <IdentityRow
          label={t("רדיוס נסיעה")}
          value={user?.travel_radius_km}
          type="number"
          unit="KM"
          placeholder={t("לא הוגדר")}
          onSave={async (v) => updateUser(await api.updateProfile({ travel_radius_km: v === null ? null : Number(v) }))}
        />
        <ChangeEmailRow user={user} updateUser={updateUser} />
        <ChangePasswordRow />
      </div>

      <div className="settings-section">
        <div className="settings-level-label">{t("YOUR LEVEL")}</div>
        {myRating ? (
          <>
            <div className="settings-level-num" dir="ltr">
              {myRating.level.toFixed(1)}
            </div>
            <div className="settings-level-status" dir="ltr">
              {myRating.provisional
                ? t("PROVISIONAL · {n} MATCHES LEFT", {
                    n: Math.max(0, PROVISIONAL_MATCHES - myRating.rated_matches),
                  })
                : myRating.finalized_at
                ? t("FINAL SINCE {month}", { month: monthAbbrev(myRating.finalized_at) })
                : t("FINAL")}
            </div>
            <p className="settings-level-note">{t("הרמה נקבעת מהתוצאות שלך, לא נקבעת ידנית.")}</p>
            <button type="button" className="settings-link-action" onClick={() => setRetaking(true)}>
              {t("RETAKE THE QUESTIONNAIRE")}
            </button>
          </>
        ) : (
          <div className="settings-level-status">{t("לא מדורג")}</div>
        )}
      </div>

      <div className="settings-section">
        <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
          <span>{t("NOTIFICATIONS")}</span>
        </div>
        <NotificationsSection user={user} updateUser={updateUser} />
      </div>

      <div className="settings-section">
        <LeaveLeagueRow />
        <EndActionsRow onLogout={handleLogout} />
      </div>

      <div className="settings-footer">{t("SAVED AUTOMATICALLY")}</div>

      {retaking && selectedSportId && (
        <RatingQuestionnaire
          retake
          sportId={selectedSportId}
          sportName={sportName}
          onClose={() => {
            setRetaking(false);
            reloadRatings();
          }}
        />
      )}
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

// settings114b.md — a row with a label + a value that becomes an editable
// input in place when tapped, saving automatically on blur (no Save button).
function IdentityRow({ label, value, placeholder, unit, type = "text", required, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { t } = useLanguage();

  function startEdit() {
    setDraft(value != null ? String(value) : "");
    setError("");
    setEditing(true);
  }

  async function commit() {
    const current = value != null ? String(value) : "";
    const next = draft.trim();
    setEditing(false);
    if (next === current || (required && next === "")) return;
    setSaving(true);
    setError("");
    try {
      await onSave(next === "" ? null : next);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") setEditing(false);
  }

  const displayValue = value != null && value !== "" ? `${value}${unit ? ` ${unit}` : ""}` : placeholder;

  return (
    <div className="settings-detail-row">
      <span className="settings-id-label">{label}</span>
      {editing ? (
        <input
          className="settings-id-input"
          type={type}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          dir={type === "number" ? "ltr" : undefined}
        />
      ) : (
        <button type="button" className="settings-id-value" onClick={startEdit} disabled={saving}>
          <span dir="auto" style={{ unicodeBidi: "isolate" }}>{displayValue}</span>
        </button>
      )}
      {error && <p className="error">{t(error)}</p>}
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

function NotificationsSection({ user, updateUser }) {
  const { t } = useLanguage();
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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

  async function togglePush() {
    setError("");
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function savePref(fields) {
    setError("");
    try {
      updateUser(await api.updateNotificationPreferences(fields));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="settings-detail-row">
        <div className="settings-detail-title">{t("התראות במכשיר")}</div>
        {supported && !loading && (
          <Toggle className="settings-toggle" checked={subscribed} onChange={togglePush} disabled={busy} label={t("התראות במכשיר")} />
        )}
      </div>

      <div className="settings-detail-row">
        <div className="settings-detail-title">{t("תוצאה לאישור")}</div>
        <Toggle className="settings-toggle" checked disabled locked onChange={() => {}} label={t("תוצאה לאישור")} />
      </div>

      <div className="settings-detail-row">
        <div className="settings-detail-title">{t("הצעות שעה")}</div>
        <Toggle
          className="settings-toggle"
          checked={!!user?.notify_time_proposals}
          onChange={(v) => savePref({ time_proposals: v })}
          label={t("הצעות שעה")}
        />
      </div>

      <div className="settings-detail-row">
        <div className="settings-detail-title">{t("פתיחת מחזור")}</div>
        <Toggle
          className="settings-toggle"
          checked={!!user?.notify_round_opens}
          onChange={(v) => savePref({ round_opens: v })}
          label={t("פתיחת מחזור")}
        />
      </div>

      <QuietHoursRow user={user} onSave={savePref} />

      {error && <p className="error">{t(error)}</p>}
    </>
  );
}

function QuietHoursRow({ user, onSave }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const from = user?.quiet_hours_from || "22:00";
  const to = user?.quiet_hours_to || "08:00";
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  function startEdit() {
    setDraftFrom(from);
    setDraftTo(to);
    setEditing(true);
  }

  async function commit(nextFrom, nextTo) {
    setEditing(false);
    if (nextFrom === from && nextTo === to) return;
    await onSave({ quiet_from: nextFrom, quiet_to: nextTo });
  }

  // Only commit when focus leaves BOTH time inputs, not when tabbing from
  // one to the other within the same row.
  function handleGroupBlur(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    commit(draftFrom, draftTo);
  }

  return (
    <div className="settings-detail-row">
      <span className="settings-id-label">{t("שעות שקט")}</span>
      {editing ? (
        <div className="settings-quiet-edit" dir="ltr" onBlur={handleGroupBlur}>
          <input type="time" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} autoFocus />
          <span aria-hidden="true">→</span>
          <input type="time" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
        </div>
      ) : (
        <button type="button" className="settings-id-value" onClick={startEdit} dir="ltr">
          {from} → {to}
        </button>
      )}
    </div>
  );
}

// settings114b.md — "Leave a league": one league leaves directly to the
// confirm sheet, two or more show a small pick list first (same pattern as
// the tabbar's single-vs-multi open-item routing).
function LeaveLeagueRow() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .myLeagues()
      .then((data) => {
        setLeagues(data.filter((l) => l.created_by !== user.id));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user.id]);

  function handleClick() {
    setError("");
    if (leagues.length === 1) {
      setTarget(leagues[0]);
    } else if (leagues.length > 1) {
      setPicking(true);
    }
  }

  async function confirmLeave() {
    setBusy(true);
    setError("");
    try {
      await api.leaveLeague(target.id);
      setLeagues((prev) => prev.filter((l) => l.id !== target.id));
      setTarget(null);
      setPicking(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (loaded && leagues.length === 0) return null;

  return (
    <div className="settings-detail-row">
      <button type="button" className="settings-link-action" onClick={handleClick}>
        {t("עזיבת ליגה")}
      </button>

      {picking && !target && (
        <div className="confirm-sheet-overlay" onClick={() => setPicking(false)}>
          <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-sheet-handle" />
            <div className="confirm-sheet-title">{t("עזיבת ליגה")}</div>
            <div className="settings-league-pick-list">
              {leagues.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="settings-league-pick-row"
                  onClick={() => {
                    setPicking(false);
                    setTarget(l);
                  }}
                >
                  <span dir="auto" style={{ unicodeBidi: "isolate" }}>{l.name}</span>
                </button>
              ))}
            </div>
            <button type="button" className="link-btn add-round-cancel" onClick={() => setPicking(false)}>
              {t("ביטול")}
            </button>
          </div>
        </div>
      )}

      {target && (
        <div className="confirm-sheet-overlay" onClick={() => setTarget(null)}>
          <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-sheet-handle" />
            <div className="confirm-sheet-title">{t("לצאת מהליגה?")}</div>
            <p className="add-round-subtitle">
              {t("התוצאות שלך יישארו בטבלה עד סוף המחזור. כדי לחזור תצטרך הזמנה חדשה.")}
            </p>
            {error && <p className="error">{t(error)}</p>}
            <div className="add-round-actions">
              <button
                type="button"
                className="confirm-sheet-btn-confirm confirm-sheet-btn-danger"
                onClick={confirmLeave}
                disabled={busy}
              >
                {busy ? t("יוצא...") : t("יציאה מהליגה")}
              </button>
              <button type="button" className="link-btn add-round-cancel" onClick={() => setTarget(null)}>
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// settings114b.md — sign-out and delete-account collapse to one gray mono
// line, no danger button or dedicated "danger zone".
function EndActionsRow({ onLogout }) {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function openDelete() {
    setPassword("");
    setError("");
    setDeleting(true);
  }

  async function handleDeleteSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.deleteAccount(password);
      logout();
      navigate("/signin");
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="settings-detail-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="settings-end-row" dir="ltr">
        <button type="button" className="settings-end-action" onClick={onLogout}>
          {t("SIGN OUT")}
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className="settings-end-action" onClick={openDelete}>
          {t("DELETE ACCOUNT")}
        </button>
      </div>

      {deleting && (
        <form onSubmit={handleDeleteSubmit} style={{ marginTop: 14 }}>
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
            <button type="button" className="link-btn" onClick={() => setDeleting(false)}>
              {t("ביטול")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
