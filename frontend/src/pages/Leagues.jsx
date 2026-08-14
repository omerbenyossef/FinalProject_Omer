import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import EmptyState from "../EmptyState.jsx";
import { TrophyIcon, ChevronIcon, TrendDownIcon, TrendUpIcon } from "../Icons.jsx";
import { SkeletonLeagueCard } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";

export default function Leagues() {
  const [leagues, setLeagues] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [bestOf, setBestOf] = useState(3);
  const [roundLengthDays, setRoundLengthDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t, dir } = useLanguage();

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

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.createLeague({
        name,
        description,
        sport_id: selectedSportId,
        is_open: isOpen,
        best_of: bestOf,
        round_length_days: roundLengthDays,
      });
      setName("");
      setDescription("");
      setIsOpen(false);
      setBestOf(3);
      setRoundLengthDays(7);
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const bySelectedSport = (l) => l.sport.id === selectedSportId;
  const openLeagues = leagues.filter((l) => l.is_open && bySelectedSport(l));
  const myLeaguesForSport = myLeagues.filter(bySelectedSport);

  return (
    <div>
      <header className="page-head">
        <div className="page-title-row">
          <h1>{t("ליגות")}</h1>
          <PageHelp
            pageKey="leagues"
            title="עמוד הליגות"
            text="כאן תוכלו לראות את הליגות שאתם חברים בהן, לעיין בליגות ציבוריות פתוחות, וליצור ליגה חדשה."
          />
        </div>
      </header>

      {user ? (
        <div className="league-action-list">
          <button type="button" className="league-action-row" onClick={() => setShowForm((v) => !v)}>
            <span>
              <span className="league-action-title emphasis">{t("צור ליגה חדשה")}</span>
              <span className="league-action-subtitle">{t("התחילו ליגה והזמינו חברים")}</span>
            </span>
            <span className="league-action-icon">
              <ChevronIcon className="league-action-chevron" aria-hidden="true" />
            </span>
          </button>
          <Link to="#open-leagues" className="league-action-row">
            <span>
              <span className="league-action-title">{t("הצטרפו לליגה ציבורית")}</span>
              <span className="league-action-subtitle">{t("התחרו מול שחקנים חדשים")}</span>
            </span>
            <span className="league-action-icon">
              <ChevronIcon className="league-action-chevron" aria-hidden="true" />
            </span>
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

      {showForm && (
        <form className="card form-card" onSubmit={handleCreate}>
          <label>
            {t("שם הליגה")}
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            {t("תיאור (אופציונלי)")}
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            {t("פורמט משחק")}
            <select value={bestOf} onChange={(e) => setBestOf(Number(e.target.value))}>
              <option value={1}>{t("עד סט אחד")}</option>
              <option value={3}>{t("עד 3 סטים")}</option>
              <option value={5}>{t("עד 5 סטים")}</option>
            </select>
          </label>
          <label>
            {t("תדירות לוח משחקים")}
            <select value={roundLengthDays} onChange={(e) => setRoundLengthDays(Number(e.target.value))}>
              <option value={7}>{t("שבועי")}</option>
              <option value={14}>{t("דו-שבועי")}</option>
            </select>
          </label>
          {user?.is_admin && (
            <label style={{ flexDirection: dir === "rtl" ? "row-reverse" : "row", justifyContent: "flex-end", gap: 8 }}>
              <input
                type="checkbox"
                checked={isOpen}
                onChange={(e) => setIsOpen(e.target.checked)}
                style={{ width: "auto" }}
              />
              {t("ליגה פתוחה (כל אחד יכול להצטרף בלי קוד הזמנה)")}
            </label>
          )}
          {error && <p className="error">{t(error)}</p>}
          <div className="inline-form">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t("יוצר...") : t("צור ליגה")}
            </button>
            <button type="button" className="link-btn" onClick={() => setShowForm(false)}>
              {t("ביטול")}
            </button>
          </div>
        </form>
      )}

      {error && !showForm && <p className="error">{t(error)}</p>}

      {user && (
        <div className="profile-section">
          <div className="profile-section-header">
            <span>
              {t("הליגות שלי")} ({myLeaguesForSport.length})
            </span>
            <span>{t("דירוג")}</span>
          </div>
          <div className="rank-row-list">
            {loading ? (
              <SkeletonLeagueCard />
            ) : (
              myLeaguesForSport.map((league) => (
                <Link to={`/leagues/${league.id}`} key={league.id} className="rank-row">
                  <span className={`rank-row-number${league.my_rank <= 3 ? " top" : ""}`} dir="ltr">
                    #{league.my_rank}
                  </span>
                  <div className="rank-row-body">
                    <div className="rank-row-name">{league.name}</div>
                    <div className="rank-row-record" dir="ltr">
                      {league.my_wins}W-{league.my_losses}L / {league.my_members_total}
                    </div>
                  </div>
                  {league.my_rank_trend ? (
                    <span className={`rank-row-trend ${league.my_rank_trend < 0 ? "down" : "up"}`} dir="ltr">
                      {league.my_rank_trend < 0 ? (
                        <TrendDownIcon aria-hidden="true" />
                      ) : (
                        <TrendUpIcon aria-hidden="true" />
                      )}
                      {Math.abs(league.my_rank_trend)}
                    </span>
                  ) : (
                    <span className="rank-row-trend flat">—</span>
                  )}
                </Link>
              ))
            )}
            {!loading && myLeaguesForSport.length === 0 && (
              <EmptyState icon={<TrophyIcon aria-hidden="true" />}>
                {t("עדיין לא הצטרפת לאף ליגה בענף הזה.")}
              </EmptyState>
            )}
          </div>
        </div>
      )}

      <div className="profile-section" id="open-leagues">
        <div className="profile-section-header">
          <span>
            {t("ליגות פתוחות")} ({openLeagues.length})
          </span>
        </div>
        <div className="open-league-list">
          {loading ? (
            <SkeletonLeagueCard />
          ) : (
            openLeagues.map((league) => (
              <Link to={`/leagues/${league.id}`} key={league.id} className="open-league-row">
                <div className="open-league-body">
                  <div className="open-league-name">{league.name}</div>
                  <div className="open-league-meta">
                    {league.member_count} {t("שחקנים")} · {t("פתוחה")}
                  </div>
                </div>
                <span className="open-league-join">{t("הצטרף")}</span>
              </Link>
            ))
          )}
          {!loading && openLeagues.length === 0 && (
            <EmptyState icon={<TrophyIcon aria-hidden="true" />}>{t("אין כרגע ליגות פתוחות.")}</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
