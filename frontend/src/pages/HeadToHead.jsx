import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { formatSets } from "../matchUtils.js";
import EmptyState from "../EmptyState.jsx";
import { PersonIcon } from "../Icons.jsx";
import { SkeletonBar, SkeletonStatRow, SkeletonMatchRow } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";
import Avatar from "../Avatar.jsx";

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
  if (!data) {
    return (
      <div>
        <Link to="/leagues" className="link-btn" style={{ display: "inline-block", marginBottom: 12 }}>
          {t("חזרה לליגות")}
        </Link>
        <div className="page-header">
          <div>
            <span className="eyebrow">{t("ראש בראש")}</span>
            <SkeletonBar width={140} height={26} style={{ marginTop: 6 }} />
          </div>
        </div>
        <div className="flat-sections">
          <div className="flat-section">
            <SkeletonStatRow />
          </div>
          <div className="flat-section">
            <h2>{t("היסטוריית משחקים")}</h2>
            <ul className="match-list">
              <SkeletonMatchRow />
              <SkeletonMatchRow />
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/leagues" className="link-btn" style={{ display: "inline-block", marginBottom: 12 }}>
        {t("חזרה לליגות")}
      </Link>
      <div className="page-header">
        <div>
          <span className="eyebrow">{t("ראש בראש")}</span>
          <div className="page-title-row">
            <Avatar name={data.opponent.name} size={36} />
            <h1>{data.opponent.name}</h1>
            <PageHelp
              pageKey="headToHead"
              title="ראש בראש"
              text="כאן תוכלו לראות את ההשוואה בינך לבין השחקן הזה - כמה ניצחתם, הפסדתם, ואת כל היסטוריית המשחקים ביניכם."
            />
          </div>
        </div>
      </div>

      <div className="flat-sections">
        <div className="flat-section">
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

        <div className="flat-section">
          <h2>{t("היסטוריית משחקים")}</h2>
          {data.matches.length === 0 && (
            <EmptyState icon={<PersonIcon aria-hidden="true" />}>
              {t("עדיין לא שיחקתם אחד נגד השני.")}
            </EmptyState>
          )}
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
                    <span className={`match-result-badge ${iWon ? "win" : "loss"}`}>{iWon ? "W" : "L"}</span>
                    <div className="match-score">
                      {m.my_score} - {m.opponent_score}
                    </div>
                  </div>
                  <div className={`sets-breakdown ${iWon ? "win" : "loss"}`}>{formatSets(m.sets)}</div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
