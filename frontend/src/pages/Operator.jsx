import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { timeAgoLabel } from "../matchUtils.js";
import { opsTagText, opsReasonLine, opsProgress, opsHealthyLine } from "../opsUtils.js";

const HEALTHY_VISIBLE = 3;
const RANGE_KEYS = ["week", "month", "all"];
const RANGE_LABELS = {
  week: "THIS WEEK",
  month: "THIS MONTH",
  all: "ALL TIME",
};

export default function Operator() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [range, setRange] = useState("week");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError("");
    api
      .opsOverview(range)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setFetchedAt(new Date());
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const visibleHealthy = data ? data.healthy.slice(0, HEALTHY_VISIBLE) : [];
  const extraHealthy = data ? data.healthy.length - visibleHealthy.length : 0;

  return (
    <div className="sched-page ops-page">
      <div className="sched-nav ops-nav">
        <div className="ops-nav-left">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">{t("OPERATOR")}</span>
        </div>
        <span className="ops-range-wrap">
          <span className="ops-range-label" dir="ltr">
            {t(RANGE_LABELS[range])} ▾
          </span>
          <select
            className="ops-range-select"
            aria-label={t("טווח")}
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            {RANGE_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(RANGE_LABELS[key])}
              </option>
            ))}
          </select>
        </span>
      </div>

      {error && <p className="error">{t(error)}</p>}

      {data && (
        <>
          <div className="ops-stats">
            <div className="ops-stat">
              <div className="ops-stat-value">{data.leagues_count}</div>
              <div className="ops-stat-label">{t("LEAGUES")}</div>
            </div>
            <div className="ops-stat">
              <div className="ops-stat-value">{data.players_count}</div>
              <div className="ops-stat-label">{t("PLAYERS")}</div>
            </div>
            <div className="ops-stat">
              <div className="ops-stat-value">{data.matches_count}</div>
              <div className="ops-stat-label">{t("MATCHES")}</div>
            </div>
            <div className="ops-stat ops-stat-voided">
              <div className="ops-stat-value">{data.voided_count}</div>
              <div className="ops-stat-label">{t("VOIDED")}</div>
            </div>
          </div>

          {data.flagged.length > 0 && (
            <div className="ops-section">
              <div className="ops-section-title">{t("NEEDS A LOOK")}</div>
              <div className="ops-flagged-list">
                {data.flagged.map((item) => {
                  const progress = opsProgress(item, t);
                  return (
                    <Link
                      to={`/leagues/${item.league_id}`}
                      className={`ops-flagged-row ops-flag-${item.flag}`}
                      key={item.league_id}
                    >
                      <div className="ops-flagged-name">{item.league_name}</div>
                      <div className="ops-flagged-tag" dir="ltr">
                        {opsTagText(item, t)}
                      </div>
                      {progress.total != null ? (
                        <div className="ops-progress">
                          <div className="ops-progress-bar">
                            <div
                              className="ops-progress-fill"
                              style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
                            />
                          </div>
                          <div className="ops-progress-label" dir="ltr">
                            {progress.current}/{progress.total} {progress.label}
                          </div>
                        </div>
                      ) : (
                        <div className="ops-progress-label" dir="ltr">
                          {progress.current} {progress.label}
                        </div>
                      )}
                      <div className="ops-flagged-reason" dir="ltr">
                        {opsReasonLine(item, t)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {data.healthy.length > 0 && (
            <div className="ops-section">
              <div className="ops-section-title">{t("RUNNING FINE")}</div>
              <div className="ops-healthy-list">
                {visibleHealthy.map((league) => (
                  <Link to={`/leagues/${league.league_id}`} className="ops-healthy-row" key={league.league_id}>
                    <div className="ops-healthy-name">{league.league_name}</div>
                    <div className="ops-healthy-meta" dir="ltr">
                      {opsHealthyLine(league, t)}
                    </div>
                  </Link>
                ))}
                {extraHealthy > 0 && (
                  <div className="ops-healthy-more" dir="ltr">
                    {t("+{n} more · ALL ON PACE", { n: extraHealthy })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="ops-footer">
            <span>{t("READ ONLY")}</span>
            <span dir="ltr">
              {t("UPDATED")} {fetchedAt ? timeAgoLabel(fetchedAt) : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
