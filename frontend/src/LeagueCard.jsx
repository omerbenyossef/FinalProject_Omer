import { Link } from "react-router-dom";
import { useLanguage } from "./LanguageContext.jsx";
import { PersonIcon } from "./Icons.jsx";

export default function LeagueCard({ league, isMember }) {
  const { t } = useLanguage();

  return (
    <Link to={`/leagues/${league.id}`} className="card league-card">
      <div className="league-card-accent" />
      <div className="league-card-body">
        <div className="league-card-top">
          <h3 className="league-card-name">{league.name}</h3>
          <span className="member-count">
            <PersonIcon aria-hidden="true" className="member-count-icon" />
            {league.member_count}
          </span>
        </div>
        {league.description && <p className="muted">{league.description}</p>}
        {isMember && <span className="pill-pending">{t("את/ה חבר/ה")}</span>}
      </div>
    </Link>
  );
}
