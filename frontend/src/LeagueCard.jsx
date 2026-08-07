import { Link } from "react-router-dom";
import { useLanguage } from "./LanguageContext.jsx";
import { PersonIcon, ChevronIcon } from "./Icons.jsx";

export default function LeagueCard({ league, isMember }) {
  const { t } = useLanguage();

  return (
    <Link to={`/leagues/${league.id}`} className="card league-card">
      <div className="league-card-accent" />
      <div className="league-card-body">
        <div className="league-card-main">
          <h3 className="league-card-name">{league.name}</h3>
          {league.description && <p className="muted">{league.description}</p>}
          {isMember && <span className="pill-pending">{t("את/ה חבר/ה")}</span>}
        </div>
        <div className="league-card-side">
          <span className="member-count">
            <PersonIcon aria-hidden="true" className="member-count-icon" />
            {league.member_count}
          </span>
          <ChevronIcon className="league-card-chevron" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}
