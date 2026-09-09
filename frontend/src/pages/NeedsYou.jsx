import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { buildOpenItemDisplay } from "../matchUtils.js";

export default function NeedsYou() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openItems, scheduledCount, reload, openItemsLoading } = useOpenAction();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!openItemsLoading && openItems.length === 0) {
      navigate("/profile", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItemsLoading, openItems.length]);

  const needCount = openItems.filter((i) => i.type !== "waiting").length;
  const waitingCount = openItems.filter((i) => i.type === "waiting").length;

  async function run(matchId, fn, { onConflict } = {}) {
    setBusyId(matchId);
    setError("");
    try {
      await fn();
      await reload();
    } catch (err) {
      if (err.status === 409 && onConflict) {
        onConflict();
      } else {
        setError(err.message);
      }
    } finally {
      setBusyId(null);
    }
  }

  function handlePrimary(item) {
    const matchId = item.match.id;
    if (item.type === "confirm") {
      run(matchId, () => api.confirmMatchResult(matchId));
    } else if (item.type === "proposed") {
      run(matchId, () => api.confirmMatchSchedule(matchId), {
        onConflict: () => navigate(`/matches/${matchId}`),
      });
    } else if (item.type === "report") {
      navigate(`/matches/${matchId}`);
    }
  }

  function handleSecondary(item) {
    const matchId = item.match.id;
    if (item.type === "confirm") {
      if (item.match.corrected_sets != null) {
        run(matchId, () => api.rejectMatchCorrection(matchId));
      } else {
        navigate(`/matches/${matchId}/correct`);
      }
    } else if (item.type === "proposed") {
      navigate(`/matches/${matchId}/schedule`);
    } else if (item.type === "waiting") {
      run(matchId, () => api.cancelMatchCorrection(matchId));
    }
  }

  return (
    <div className="sched-page needs-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("NEEDS YOU")}</span>
      </div>

      <div className="needs-count">{openItems.length}</div>
      <div className="needs-count-sub">
        {t("{n} need you · {m} waiting", { n: needCount, m: waitingCount })}
      </div>

      {error && <p className="error">{t(error)}</p>}

      <div className="needs-list">
        {openItems.map((item) => {
          const d = buildOpenItemDisplay(item, user.id, t);
          const busy = busyId === item.match.id;
          const isWaiting = item.type === "waiting";

          return (
            <div className={`needs-item${isWaiting ? " is-waiting" : ""}`} key={`${item.type}-${item.match.id}`}>
              {isWaiting ? (
                <>
                  <div className="needs-item-type">{d.typeLabel}</div>
                  <div className="needs-item-opponent">
                    <Link to={`/players/${d.opponentId}`} className="needs-item-name">
                      <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                        {d.opponentName}
                      </span>
                    </Link>
                  </div>
                  <div className="needs-item-context" dir="ltr">
                    {d.context}
                    {" · "}
                    <button
                      type="button"
                      className="needs-inline-action"
                      disabled={busy}
                      onClick={() => handleSecondary(item)}
                    >
                      {d.secondaryLabel}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="needs-item-head">
                    <span className="needs-item-type">{d.typeLabel}</span>
                    <span className="needs-item-age" dir="ltr">
                      {d.age}
                    </span>
                  </div>
                  <div className="needs-item-opponent">
                    <Link to={`/players/${d.opponentId}`} className="needs-item-name">
                      <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                        {d.opponentName}
                      </span>
                    </Link>
                    {d.value && (
                      <span className={`needs-item-value needs-item-value-${d.valueKind}`} dir="ltr">
                        {d.value}
                      </span>
                    )}
                  </div>
                  <div className="needs-item-context" dir="ltr">
                    {d.context}
                  </div>
                  <div className="needs-item-actions">
                    <button
                      type="button"
                      className={`needs-action-primary${d.primaryLime ? " lime" : ""}`}
                      disabled={busy}
                      onClick={() => handlePrimary(item)}
                    >
                      {d.primaryLime && <span className="needs-action-dot" aria-hidden="true" />}
                      {d.primaryLabel}
                    </button>
                    {d.secondaryLabel && (
                      <button
                        type="button"
                        className="needs-action-secondary"
                        disabled={busy}
                        onClick={() => handleSecondary(item)}
                      >
                        {d.secondaryLabel}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="needs-footer">
        <span>{t("NOTHING ELSE IS WAITING")}</span>
        <span>{t("{n} MATCHES SCHEDULED", { n: scheduledCount })}</span>
      </div>
    </div>
  );
}
