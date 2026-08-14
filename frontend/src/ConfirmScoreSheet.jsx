import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import Avatar from "./Avatar.jsx";
import SetScoreForm from "./SetScoreForm.jsx";
import { formatDayMonth } from "./matchUtils.js";

export default function ConfirmScoreSheet({ match, currentUserId, onConfirm, onDispute, onClose, busy }) {
  const { t } = useLanguage();
  const [disputing, setDisputing] = useState(false);

  const iAmPlayer1 = match.player1.id === currentUserId;
  const reporter = match.reported_by === match.player1.id ? match.player1 : match.player2;
  const me = iAmPlayer1 ? match.player1 : match.player2;
  const isReporterMe = reporter.id === me.id;
  const other = isReporterMe ? (iAmPlayer1 ? match.player2 : match.player1) : reporter;

  const setsFor = (playerIsPlayer1) =>
    (match.sets || []).map((s) => (playerIsPlayer1 ? s.player1_games : s.player2_games));

  const otherIsPlayer1 = other.id === match.player1.id;
  const meIsPlayer1 = me.id === match.player1.id;

  return (
    <div className="confirm-sheet-overlay" onClick={onClose}>
      <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-sheet-handle" />
        <div className="confirm-sheet-eyebrow">{t("אישור תוצאה")}</div>
        <div className="confirm-sheet-title">
          {t("{name} דיווח/ה על המשחק ביניכם", { name: reporter.name })}
        </div>

        {disputing ? (
          <SetScoreForm
            player1Name={match.player1.name}
            player2Name={match.player2.name}
            initialSets={match.sets}
            onSubmit={(sets) => onDispute(sets)}
            onCancel={() => setDisputing(false)}
            busy={busy}
            submitLabel="עדכן תוצאה"
          />
        ) : (
          <>
            <div className="confirm-sheet-rows">
              <div className="confirm-sheet-row">
                <div className="confirm-sheet-player">
                  <Avatar name={other.name} size={34} />
                  <span>{other.name}</span>
                </div>
                <span className="confirm-sheet-score" dir="ltr">
                  {setsFor(otherIsPlayer1).join(" · ")}
                </span>
              </div>
              <div className="confirm-sheet-divider" />
              <div className="confirm-sheet-row">
                <div className="confirm-sheet-player">
                  <Avatar name={me.name} size={34} background="var(--court)" color="var(--court-contrast)" />
                  <span>{t("{name} (את/ה)", { name: me.name })}</span>
                </div>
                <span className="confirm-sheet-score win" dir="ltr">
                  {setsFor(meIsPlayer1).join(" · ")}
                </span>
              </div>
            </div>

            <div className="confirm-sheet-actions">
              <button type="button" className="confirm-sheet-btn-confirm" onClick={onConfirm} disabled={busy}>
                {t("מאשר, זו התוצאה")}
              </button>
              <button type="button" className="confirm-sheet-btn-dispute" onClick={() => setDisputing(true)}>
                {t("התוצאה לא נכונה")}
              </button>
            </div>
            <p className="confirm-sheet-footnote">
              {t("אם לא תגיב/י עד {date} התוצאה תאושר אוטומטית", {
                date: match.auto_confirm_at ? formatDayMonth(new Date(match.auto_confirm_at)) : "",
              })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
