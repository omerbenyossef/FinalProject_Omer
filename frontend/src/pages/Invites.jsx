import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import EmptyLine from "../EmptyLine.jsx";
import { formatWeekdayDateTime, timeAgoLabel } from "../matchUtils.js";

// Friendly invitations waiting for an answer. They are deliberately kept out
// of the week's carousel — nothing is scheduled until one is accepted.
export default function Invites() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { nextMatches, matchesLoading, reload } = useOpenAction();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const invites = nextMatches.filter(
    (entry) =>
      entry.kind === "friendly" &&
      entry.match.invite_status === "pending" &&
      entry.match.player1.id !== user?.id
  );

  async function run(matchId, fn) {
    setBusyId(matchId);
    setError("");
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="sched-page needs-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("INVITES")}</span>
      </div>

      <div className="needs-count">{invites.length}</div>
      <div className="needs-count-sub">{t("משחקים שהוצעו לך")}</div>

      {error && <p className="error">{t(error)}</p>}

      {!matchesLoading && invites.length === 0 && (
        <EmptyLine sentence={t("אין הזמנות שמחכות לתשובה שלך.")} />
      )}

      <div className="needs-list">
        {invites.map((entry) => {
          const m = entry.match;
          const inviter = m.player1;
          const busy = busyId === m.id;
          return (
            <div className="needs-item" key={m.id}>
              <div className="needs-item-head">
                <span className="needs-item-type">{t("FRIENDLY INVITE")}</span>
                <span className="needs-item-age" dir="ltr">
                  {timeAgoLabel(new Date(m.created_at))}
                </span>
              </div>
              <div className="needs-item-opponent">
                <Link to={`/players/${inviter.id}`} className="needs-item-name">
                  <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                    {inviter.name}
                  </span>
                </Link>
              </div>
              <div className="needs-item-context" dir="auto">
                {m.scheduled_at
                  ? formatWeekdayDateTime(new Date(m.scheduled_at))
                  : t("הזמין/ה אותך למשחק ידידותי")}
              </div>
              <div className="needs-item-actions">
                <button
                  type="button"
                  className="needs-action-primary lime"
                  disabled={busy}
                  onClick={() => run(m.id, () => api.acceptFriendlyInvite(m.id))}
                >
                  <span className="needs-action-dot" aria-hidden="true" />
                  {t("אשר הזמנה")}
                </button>
                <button
                  type="button"
                  className="needs-action-secondary"
                  disabled={busy}
                  onClick={() => run(m.id, () => api.declineFriendlyInvite(m.id))}
                >
                  {t("דחה הזמנה")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
