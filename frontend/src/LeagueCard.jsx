import { Link } from "react-router-dom";

export default function LeagueCard({ league, isMember }) {
  return (
    <Link to={`/leagues/${league.id}`} className="card league-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="sport-tag">{league.sport.name}</span>
        {isMember && <span className="pill-pending">את/ה חבר/ה</span>}
      </div>
      <h3>{league.name}</h3>
      {league.description && <p className="muted">{league.description}</p>}
      <p className="member-count">{league.member_count} שחקנים</p>
    </Link>
  );
}
