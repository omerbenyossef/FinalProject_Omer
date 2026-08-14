import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { formatSets, formatDayMonth } from "../matchUtils.js";
import EmptyState from "../EmptyState.jsx";
import { PersonIcon, ChevronIcon } from "../Icons.jsx";
import { SkeletonBar, SkeletonStatRow, SkeletonMatchRow } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";
import Avatar from "../Avatar.jsx";

export default function HeadToHead() {
  const { opponentId } = useParams();
  const { user } = useAuth();
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
        <Link to="/leagues" className="back-link">
          <ChevronIcon aria-hidden="true" />
          {t("חזרה")}
        </Link>
        <span className="league-detail-meta" style={{ display: "block", marginTop: 14 }}>
          {t("ראש בראש")}
        </span>
        <SkeletonBar width={140} height={26} style={{ marginTop: 10 }} />
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
      <header className="page-head">
        <Link to="/leagues" className="back-link">
          <ChevronIcon aria-hidden="true" />
          {t("חזרה")}
        </Link>
        <div className="page-title-row" style={{ marginTop: 14 }}>
          <span className="league-detail-meta">{t("ראש בראש")}</span>
          <PageHelp
            pageKey="headToHead"
            title="ראש בראש"
            text="כאן תוכלו לראות את ההשוואה בינך לבין השחקן הזה - כמה ניצחתם, הפסדתם, ואת כל היסטוריית המשחקים ביניכם."
          />
        </div>
      </header>

      <div className="h2h-compare">
        <div className="h2h-side">
          <Avatar name={user?.name} size={52} color="var(--court)" />
          <span className="h2h-side-name">{user?.name}</span>
        </div>
        <div className="h2h-score" dir="ltr">
          <span className="h2h-score-mine">{data.wins}</span>
          <span className="h2h-score-dash">–</span>
          <span className="h2h-score-theirs">{data.losses}</span>
        </div>
        <div className="h2h-side">
          <Avatar name={data.opponent.name} size={52} />
          <span className="h2h-side-name">{data.opponent.name}</span>
        </div>
      </div>

      <div className="h2h-stats">
        <div className="h2h-stat-tile">
          <div className="h2h-stat-value win">{data.wins}</div>
          <div className="h2h-stat-label">{t("ניצחונות")}</div>
        </div>
        <div className="h2h-stat-tile">
          <div className="h2h-stat-value">{data.losses}</div>
          <div className="h2h-stat-label">{t("הפסדים")}</div>
        </div>
        <div className="h2h-stat-tile">
          <div className="h2h-stat-value">{data.matches.length}</div>
          <div className="h2h-stat-label">{t("משחקים")}</div>
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-header" style={{ justifyContent: "flex-start" }}>
          <span>{t("היסטוריית משחקים")}</span>
        </div>
        {data.matches.length === 0 && (
          <EmptyState icon={<PersonIcon aria-hidden="true" />}>
            {t("עדיין לא שיחקתם אחד נגד השני.")}
          </EmptyState>
        )}
        <div className="recent-result-list">
          {data.matches.map((m) => {
            const iWon = m.my_score > m.opponent_score;
            return (
              <div className="recent-result-row" key={m.id}>
                <span className={`match-result-badge ${iWon ? "win" : "loss"}`}>{iWon ? "W" : "L"}</span>
                <span className="recent-result-name">
                  {[m.league_name, m.played_at ? formatDayMonth(new Date(m.played_at)) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className={`recent-result-score${iWon ? " win" : ""}`} dir="ltr">
                  {formatSets(m.sets)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
