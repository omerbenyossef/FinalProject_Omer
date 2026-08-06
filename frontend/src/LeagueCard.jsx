import { Link } from "react-router-dom";
import { useLanguage } from "./LanguageContext.jsx";
import { useSport } from "./SportContext.jsx";
import { PersonIcon, ChevronIcon } from "./Icons.jsx";
import { getSportIcon } from "./sportIcons.js";

export default function LeagueCard({ league, isMember }) {
  const { t } = useLanguage();
  const { sports, selectedSportId } = useSport();
  const sportName = sports.find((s) => s.id === selectedSportId)?.name;
  const SportIcon = getSportIcon(sportName);

  return (
    <Link to={`/leagues/${league.id}`} className="card league-card">
      <SportIcon className="league-card-watermark" aria-hidden="true" />
      <div className="league-card-top">
        <h3 className="league-card-name">{league.name}</h3>
        <ChevronIcon className="league-card-chevron" aria-hidden="true" />
      </div>
      {league.description && <p className="league-card-desc">{league.description}</p>}
      <div className="league-card-foot">
        <span className="member-count">
          <PersonIcon aria-hidden="true" className="member-count-icon" />
          {league.member_count}
        </span>
        {isMember && <span className="league-card-pill">{t("את/ה חבר/ה")}</span>}
      </div>
    </Link>
  );
}
