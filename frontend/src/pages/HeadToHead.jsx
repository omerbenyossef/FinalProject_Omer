import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { formatSets } from "../matchUtils.js";

export default function HeadToHead() {
  const { opponentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const { t } = useLanguage();

  useEffect(() => {
    api
      .headToHead(opponentId)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [opponentId]);

  if (error) return <p className="error">{t(error)}</p>;
  if (!data) return <p className="muted">{t("טוען...")}</p>;

  return (
    <div>
      <Link to="/leagues" className="link-btn" style={{ display: "inline-block", marginBottom: 12 }}>
        {t("חזרה לליגות")}
      </Link>
      <div className="page-header">
        <div>
          <span className="eyebrow">{t("ראש בראש")}</span>
          <h1>{data.opponent.name}</h1>
        </div>
      </div>

      <div className="card">
        <div className="stat-row">
          <div className="stat-tile">
            <div className="stat-value">{data.wins}</div>
            <div className="stat-label">{t("ניצחונות")}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{data.losses}</div>
            <div className="stat-label">{t("הפסדים")}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{data.matches.length}</div>
            <div className="stat-label">{t("משחקים")}</div>
          </div>
        </div>
      </div>

      <section className="card">
        <h2>{t("היסטוריית משחקים")}</h2>
        {data.matches.length === 0 && <p className="muted">{t("עדיין לא שיחקתם אחד נגד השני.")}</p>}
        <ul className="match-list">
          {data.matches.map((m) => {
            const iWon = m.my_score > m.opponent_score;
            return (
              <li className="match-row" key={m.id}>
                <div className="match-players">
                  <Link to={`/leagues/${m.league_id}`} className="sport-tag" style={{ marginBottom: 0 }}>
                    {m.league_name}
                  </Link>
                </div>
                <div className="score-row">
                  <span className={`status-dot ${iWon ? "dot-win" : "dot-loss"}`} />
                  <div className="match-score">
                    {m.my_score} - {m.opponent_score}
                  </div>
                </div>
                <div className="sets-breakdown">{formatSets(m.sets)}</div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
