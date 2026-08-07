import { Link } from "react-router-dom";
import { useLanguage } from "./LanguageContext.jsx";
import { PersonIcon, ChevronIcon, TrendDownIcon, TrendUpIcon } from "./Icons.jsx";
import { getSportColor } from "./sportIcons.js";
import { formatWeekLabel } from "./matchUtils.js";

function MyLeagueCard({ league }) {
  const { t } = useLanguage();
  const played = (league.my_wins ?? 0) + (league.my_losses ?? 0);
  const weekLabel = league.my_next_match
    ? formatWeekLabel(league.schedule_started_at, league.my_next_match.round_number, t)
    : "";

  return (
    <Link to={`/leagues/${league.id}`} className="card league-card-mine">
      <div className="league-card-mine-top">
        <div className="league-card-mine-info">
          <div className="league-card-eyebrow">
            <span
              className="league-card-eyebrow-dot"
              style={{ background: getSportColor(league.sport?.name) }}
            />
            {t(league.sport?.name)}
          </div>
          <h3 className="league-card-mine-title">{league.name}</h3>
          <span className="league-card-record">
            {played > 0 ? (
              <bdi>{`${league.my_wins}W-${league.my_losses}L · ${league.my_win_rate}%`}</bdi>
            ) : (
              t("עדיין לא שיחקת/ה")
            )}
            {!!league.my_rank_trend && (
              <span className={`league-card-trend ${league.my_rank_trend < 0 ? "down" : "up"}`}>
                <span className="league-card-trend-value">
                  {league.my_rank_trend < 0 ? (
                    <TrendDownIcon aria-hidden="true" />
                  ) : (
                    <TrendUpIcon aria-hidden="true" />
                  )}
                  {`${league.my_rank_trend > 0 ? "+" : ""}${league.my_rank_trend}`}
                </span>{" "}
                {t("השבוע")}
              </span>
            )}
          </span>
        </div>
        {league.my_rank != null && (
          <span className="league-card-rank-wrap">
            <span className="league-card-rank">#{league.my_rank}</span>
            <span className="league-card-rank-total">/{league.my_members_total}</span>
          </span>
        )}
      </div>
      <div className="league-card-divider" />
      <div className="league-card-next">
        <span>
          {league.my_next_match
            ? t("נגד {name}{week}", {
                name: league.my_next_match.opponent_name,
                week: weekLabel ? ` · ${weekLabel}` : "",
              })
            : t("אין משחק קרוב")}
        </span>
        <ChevronIcon className="league-card-chevron" aria-hidden="true" />
      </div>
    </Link>
  );
}

export default function LeagueCard({ league, isMember }) {
  const { t } = useLanguage();

  if (league.my_rank != null) {
    return <MyLeagueCard league={league} />;
  }

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
