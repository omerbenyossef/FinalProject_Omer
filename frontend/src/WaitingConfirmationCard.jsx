import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import Avatar from "./Avatar.jsx";
import SetScoreForm from "./SetScoreForm.jsx";
import { formatRelativeTime, formatDayMonth, matchSides } from "./matchUtils.js";
import { api } from "./api.js";

export default function WaitingConfirmationCard({
  match,
  currentUserId,
  leagueId,
  onSubmit,
  onReminderSent,
  maxSets,
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);

  const sides = matchSides(match, currentUserId);
  const iAmPlayer1 = sides.iAmSide1;
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
          player1Name={sides.side1Label}
          player2Name={sides.side2Label}
          initialSets={match.sets}
          onSubmit={(sets) => {
            onSubmit(sets);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          maxSets={maxSets}
          submitLabel="עדכן תוצאה"
        />
      </div>
    );
  }

  return (
    <div className="waiting-card">
      <div className="waiting-compare">
        <div className="waiting-side">
          {sides.mine.map((p) => (
            <Avatar key={p.id} name={p.name} photoUrl={p.photo_url} size={44} color="var(--court)" />
          ))}
          <span className="waiting-side-name">{sides.myLabel}</span>
        </div>
        <div className="waiting-sets" dir="ltr">
          {(mySets || []).map((s, i) => (
            <span key={i} className="waiting-set">
              {s.player1_games}-{s.player2_games}
            </span>
          ))}
        </div>
        <div className="waiting-side">
          {sides.opponents.map((p) => (
            <Avatar key={p.id} name={p.name} photoUrl={p.photo_url} size={44} />
          ))}
          <span className="waiting-side-name">{sides.opponentLabel}</span>
        </div>
      </div>
      <div className="waiting-status">
        <span className="waiting-status-dot" />
        <span className="waiting-status-text">{t("ממתין לאישור של {name}", { name: sides.opponentLabel })}</span>
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
