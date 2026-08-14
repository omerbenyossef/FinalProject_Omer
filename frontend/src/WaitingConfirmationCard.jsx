import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import Avatar from "./Avatar.jsx";
import SetScoreForm from "./SetScoreForm.jsx";
import { formatRelativeTime, formatDayMonth } from "./matchUtils.js";
import { api } from "./api.js";

export default function WaitingConfirmationCard({ match, currentUserId, leagueId, onSubmit, onReminderSent }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);

  const iAmPlayer1 = match.player1.id === currentUserId;
  const me = iAmPlayer1 ? match.player1 : match.player2;
  const opponent = iAmPlayer1 ? match.player2 : match.player1;
  const mySets = iAmPlayer1
    ? match.sets
    : match.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));

  async function handleReminder() {
    setReminding(true);
    try {
      await api.sendMatchReminder(leagueId, match.id);
      setReminded(true);
      onReminderSent?.();
    } catch {
      // best-effort — reminder is a courtesy nudge, not critical
    } finally {
      setReminding(false);
    }
  }

  if (editing) {
    return (
      <div className="my-match-card">
        <SetScoreForm
          player1Name={match.player1.name}
          player2Name={match.player2.name}
          initialSets={match.sets}
          onSubmit={(sets) => {
            onSubmit(sets);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          submitLabel="עדכן תוצאה"
        />
      </div>
    );
  }

  return (
    <div className="waiting-card">
      <div className="waiting-compare">
        <div className="waiting-side">
          <Avatar name={me.name} size={44} color="var(--court)" />
          <span className="waiting-side-name">{me.name}</span>
        </div>
        <div className="waiting-sets" dir="ltr">
          {(mySets || []).map((s, i) => (
            <span key={i} className="waiting-set">
              {s.player1_games}-{s.player2_games}
            </span>
          ))}
        </div>
        <div className="waiting-side">
          <Avatar name={opponent.name} size={44} />
          <span className="waiting-side-name">{opponent.name}</span>
        </div>
      </div>
      <div className="waiting-status">
        <span className="waiting-status-dot" />
        <span className="waiting-status-text">{t("ממתין לאישור של {name}", { name: opponent.name })}</span>
        {match.played_at && (
          <span className="waiting-status-time">{formatRelativeTime(new Date(match.played_at), t)}</span>
        )}
      </div>
      <p className="waiting-note">
        {t(
          "התוצאה תיכנס לטבלה אחרי שהיריב יאשר אותה. אם הוא לא יגיב עד {date} היא תאושר אוטומטית.",
          { date: match.auto_confirm_at ? formatDayMonth(new Date(match.auto_confirm_at)) : "" }
        )}
      </p>
      <div className="waiting-actions">
        <button type="button" className="waiting-btn" onClick={handleReminder} disabled={reminding || reminded}>
          {reminded ? t("תזכורת נשלחה") : t("שלח תזכורת")}
        </button>
        <button type="button" className="waiting-btn muted" onClick={() => setEditing(true)}>
          {t("ערוך תוצאה")}
        </button>
      </div>
    </div>
  );
}
