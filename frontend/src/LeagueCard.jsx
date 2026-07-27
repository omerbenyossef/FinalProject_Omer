import { Link } from "react-router-dom";
import { useLanguage } from "./LanguageContext.jsx";

export default function LeagueCard({ league, isMember }) {
  const { t } = useLanguage();

  return (
    <Link to={`/leagues/${league.id}`} className="card league-card">
      {isMember && (
        <div style={{ marginBottom: 8 }}>
          <span className="pill-pending">{t("את/ה חבר/ה")}</span>
        </div>
      )}
      <h3>{league.name}</h3>
      {league.description && <p className="muted">{league.description}</p>}
      <p className="member-count">
        {league.member_count} {t("שחקנים")}
      </p>
    </Link>
  );
}
