import { Link } from "react-router-dom";
import { useLanguage } from "./LanguageContext.jsx";
import { getSportIcon } from "./sportIcons.js";
import { PersonIcon } from "./Icons.jsx";
import { colorForName } from "./Avatar.jsx";

export default function LeagueCard({ league, isMember }) {
  const { t } = useLanguage();
  const SportIcon = getSportIcon(league.sport?.name);

  return (
    <Link to={`/leagues/${league.id}`} className="card league-card">
      <div className="league-card-icon-block" style={{ background: colorForName(league.name) }}>
        <SportIcon aria-hidden="true" />
      </div>
      <div className="league-card-body">
        {isMember && <span className="pill-pending">{t("את/ה חבר/ה")}</span>}
        <h3>{league.name}</h3>
        {league.description && <p className="muted">{league.description}</p>}
        <p className="member-count">
          <PersonIcon aria-hidden="true" className="member-count-icon" />
          {league.member_count} {t("שחקנים")}
        </p>
      </div>
    </Link>
  );
}
