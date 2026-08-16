import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import EmptyState from "../EmptyState.jsx";
import { TrophyIcon, ChevronIcon } from "../Icons.jsx";
import { SkeletonLeagueCard } from "../Skeleton.jsx";
import { leagueRuleLabels } from "../matchUtils.js";
import PageHelp from "../PageHelp.jsx";

export default function Leagues() {
  const [leagues, setLeagues] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const { sports, selectedSportId } = useSport();
  const { t } = useLanguage();

  async function loadData() {
    setLoading(true);
    try {
      const leaguesData = await api.listLeagues();
      setLeagues(leaguesData);

      if (user) {
        const mine = await api.myLeagues();
        setMyLeagues(mine);
      } else {
        setMyLeagues([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const bySelectedSport = (l) => l.sport.id === selectedSportId;
  const openLeagues = leagues.filter((l) => l.is_open && bySelectedSport(l));
  const myLeaguesForSport = myLeagues.filter(bySelectedSport);
  const selectedSport = sports.find((s) => s.id === selectedSportId);

  return (
    <div>
      <header className="page-head">
        <div className="home-head-top">
          <h1 className="home-name">{t("ליגות")}</h1>
          <PageHelp
            pageKey="leagues"
            title="עמוד הליגות"
            text="כאן תוכלו לראות את הליגות שאתם חברים בהן, לעיין בליגות ציבוריות פתוחות, וליצור ליגה חדשה."
          />
        </div>
        {selectedSport && <div className="home-summary">{t(selectedSport.name)}</div>}
      </header>

      {user ? (
        <div className="leagues-actions">
          <Link to="/leagues/new" className="btn-create-league">
            {t("צור ליגה חדשה")}
          </Link>
        </div>
      ) : (
        <EmptyState
          icon={<TrophyIcon aria-hidden="true" />}
          action={
            <Link to="/login" className="btn-secondary btn-small">
              {t("כניסה")}
            </Link>
          }
        >
          {t("רוצה להקים ליגה? יש להירשם או להתחבר קודם.")}
        </EmptyState>
      )}

      {error && <p className="error">{t(error)}</p>}

      {user && (
        <>
          <div className="home-section-head">
            <span>{t("הליגות שלי")}</span>
            <span className="num">{myLeaguesForSport.length}</span>
          </div>
          <div className="rank-row-list">
            {loading ? (
              <SkeletonLeagueCard />
            ) : (
              myLeaguesForSport.map((league) => (
                <Link to={`/leagues/${league.id}`} key={league.id} className="league-row">
                  <span className={`league-row-rank${league.my_rank <= 3 ? " top" : ""}`} dir="ltr">
                    {league.my_rank}
                  </span>
                  <div className="league-row-body">
                    <div className="league-row-name">
                      <span dir="auto">{league.name}</span>
                    </div>
                    <div className="league-row-sub" dir="ltr">
                      {league.my_wins}W-{league.my_losses}L · {league.my_members_total} {t("שחקנים")}
                    </div>
                  </div>
                  {league.my_rank_trend ? (
                    <span className={`league-row-trend ${league.my_rank_trend > 0 ? "up" : "down"}`} dir="ltr">
                      {league.my_rank_trend > 0
                        ? `▲${league.my_rank_trend}`
                        : `▼${Math.abs(league.my_rank_trend)}`}
                    </span>
                  ) : (
                    <span className="league-row-trend" dir="ltr">—</span>
                  )}
                  <ChevronIcon className="league-row-chevron chevron-icon" aria-hidden="true" />
                </Link>
              ))
            )}
            {!loading && myLeaguesForSport.length === 0 && (
              <EmptyState icon={<TrophyIcon aria-hidden="true" />}>
                {t("עדיין לא הצטרפת לאף ליגה בענף הזה.")}
              </EmptyState>
            )}
          </div>
        </>
      )}

      <div className="home-section-head">
        <span>{t("ליגות פתוחות")}</span>
        <span className="num">{openLeagues.length}</span>
      </div>
      <div className="open-league-list">
        {loading ? (
          <SkeletonLeagueCard />
        ) : (
          openLeagues.map((league) => {
            const ruleLabels = leagueRuleLabels(league, t);
            return (
              <Link to={`/leagues/${league.id}`} key={league.id} className="open-league-row">
                <div className="open-league-body">
                  <div className="open-league-name">
                    <span dir="auto">{league.name}</span>
                  </div>
                  <div className="open-league-meta" dir="ltr">
                    {league.member_count} {t("שחקנים")} · {ruleLabels.frequencyLabel} · {ruleLabels.bestOfLabel}
                  </div>
                </div>
                <span className="open-league-join">{t("הצטרף")}</span>
              </Link>
            );
          })
        )}
        {!loading && openLeagues.length === 0 && (
          <EmptyState icon={<TrophyIcon aria-hidden="true" />}>{t("אין כרגע ליגות פתוחות.")}</EmptyState>
        )}
      </div>
    </div>
  );
}
