import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useSport } from "../SportContext.jsx";
import { getExistingSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "../push.js";
import PageHelp from "../PageHelp.jsx";
import Toggle from "../Toggle.jsx";
import RatingQuestionnaire from "../RatingQuestionnaire.jsx";
import { monthName } from "../matchUtils.js";

const PROVISIONAL_MATCHES = 3;

function monthAbbrev(dateStr, t) {
  return monthName(new Date(dateStr), t);
}

/* A second way into your own account. An account opened with Google has no
   password, so the morning Google will not let you in — a blocked popup, a
   browser that eats third-party frames, an account your school manages —
   there is no other door. This builds one, and asks for no current password:
   whoever is holding a valid token has already proved who they are, which is
   the same reasoning the deletion row below uses. */
function PasswordSection() {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    if (password.length < 8) {
      setError("הסיסמה חייבת להכיל 8 תווים לפחות");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.setPassword(password);
      setPassword("");
      setDone("הסיסמה נשמרה");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-password" onSubmit={save}>
      <p className="settings-password-note">
        {t("סיסמה נוספת לחשבון, למקרה שההתחברות עם Google לא עובדת.")}
      </p>
      <input
        className="signfield-input"
        type="password"
        autoComplete="new-password"
        dir="ltr"
        placeholder={t("סיסמה חדשה")}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setDone("");
        }}
      />
      {error && <p className="signfield-error">{t(error)}</p>}
      {done && <p className="settings-password-done">{t(done)}</p>}
      <button type="submit" className="btn-secondary btn-small" disabled={saving || !password}>
        {t("שמור סיסמה")}
      </button>
    </form>
  );
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
            text="כאן תוכלו לערוך את הפרופיל שלכם, להפעיל התראות, ולשנות שפה או מראה."
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
        <AccountRow user={user} />
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
                ? t("FINAL SINCE {month}", { month: monthAbbrev(myRating.finalized_at, t) })
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
        <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
          <span>{t("הגדרת סיסמה")}</span>
        </div>
        <PasswordSection />
      </div>

      <div className="settings-section">
        <LeaveLeagueRow />
        <EndActionsRow onLogout={handleLogout} />
      </div>

      <div className="settings-legal">
        <Link to="/privacy">{t("מדיניות פרטיות")}</Link>
        <span aria-hidden="true">·</span>
        <Link to="/terms">{t("תנאי שימוש")}</Link>
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

  // The chip names the language it is in, so it never translates itself.
  return (
    <button type="button" className="settings-chip" onClick={cycle}>
      {language === "en" ? "English" : "עברית"}
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

/* The address is Google's, not ours — it arrives with the sign-in and there is
   nothing here to edit. Shown because knowing which account you are in is
   worth a line, and because a player with two Google addresses will want to
   check which one Rally knows them by. */
function AccountRow({ user }) {
  const { t } = useLanguage();
  return (
    <div className="settings-detail-row">
      <div>
        <div className="settings-detail-title">{t("אימייל")}</div>
        <div className="settings-detail-value mono" dir="ltr">
          {user?.email}
        </div>
      </div>
      <div className="settings-detail-note">{t("מחשבון Google")}</div>
    </div>
  );
}

function NotificationsSection({ user, updateUser }) {
  const { t } = useLanguage();
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [tested, setTested] = useState("");
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

  // Whoever sets the keys up can't see someone else's phone, so the only way
  // to know push actually arrives is to ask for one.
  async function sendTest() {
    setError("");
    setTested("");
    setBusy(true);
    try {
      const data = await api.testPush();
      setTested(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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

      {subscribed && (
        <div className="settings-detail-row">
          <div className="settings-detail-title">{tested ? t(tested) : t("בדיקת התראה")}</div>
          <button type="button" className="link-btn" onClick={sendTest} disabled={busy}>
            {t("שלח")}
          </button>
        </div>
      )}

      {/* There used to be a "result to confirm" row here: a toggle that was
          checked, disabled and locked, with an empty onChange. It existed to
          say that those always arrive, but a switch nobody can move reads as a
          broken control. The two rows below are the only real choices. */}
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

// settings114b.md — t("יציאה מליגה"): one league leaves directly to the
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
        setLeagues(data);
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
              {target.created_by === user.id
                ? t("תמשיך לנהל את הליגה כרגיל, פשוט לא תהיה בה כשחקן.")
                : t("התוצאות שלך יישארו בטבלה עד סוף המחזור. כדי לחזור תצטרך הזמנה חדשה.")}
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function openDelete() {
    setConfirmation("");
    setError("");
    setDeleting(true);
  }

  async function handleDeleteSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.deleteAccount(confirmation);
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
          {/* No password to ask for. Typing the address out is what makes
              this a decision rather than a mis-tap. */}
          <label>
            {t("הקלידו {email} כדי לאשר", { email: user?.email || "" })}
            <input
              type="email"
              autoComplete="off"
              dir="ltr"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
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
