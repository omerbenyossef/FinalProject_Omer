import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import LeagueCard from "../LeagueCard.jsx";
import EmptyState from "../EmptyState.jsx";
import { TrophyIcon } from "../Icons.jsx";
import { SkeletonLeagueCard } from "../Skeleton.jsx";
import PageHelp from "../PageHelp.jsx";

export default function Leagues() {
  const [leagues, setLeagues] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showMyLeagues, setShowMyLeagues] = useState(false);
  const [showOpenLeagues, setShowOpenLeagues] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isOpen, setIsOpen] = useState(false);
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
      await api.createLeague({ name, description, sport_id: selectedSportId, is_open: isOpen });
      setName("");
      setDescription("");
      setIsOpen(false);
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
  const myLeagueIds = new Set(myLeaguesForSport.map((l) => l.id));

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1>{t("ליגות פעילות")}</h1>
          <PageHelp
            pageKey="leagues"
            title="עמוד הליגות"
            text="כאן תוכלו לראות את הליגות שאתם חברים בהן, לעיין בליגות ציבוריות פתוחות, וליצור ליגה חדשה."
          />
        </div>
        {user && (
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? t("ביטול") : `+ ${t("יצירת ליגה")}`}
          </button>
        )}
      </div>

      {!user && (
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
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? t("יוצר...") : t("צור ליגה")}
          </button>
        </form>
      )}

      {error && !showForm && <p className="error">{t(error)}</p>}

      <div className="flat-sections">
        {user && (
          <div className="flat-section">
            <button
              type="button"
              className="settings-row collapsible-toggle"
              onClick={() => setShowMyLeagues((v) => !v)}
            >
              <h2>{t("הליגות שלי")} ({myLeaguesForSport.length})</h2>
              <span className="muted">{showMyLeagues ? t("הסתר") : t("הצג")}</span>
            </button>

            {showMyLeagues && (
              <div className="league-grid" style={{ marginTop: 14 }}>
                {loading ? (
                  <>
                    <SkeletonLeagueCard />
                    <SkeletonLeagueCard />
                  </>
                ) : (
                  myLeaguesForSport.map((league) => <LeagueCard league={league} key={league.id} />)
                )}
                {!loading && myLeaguesForSport.length === 0 && (
                  <EmptyState icon={<TrophyIcon aria-hidden="true" />}>
                    {t("עדיין לא הצטרפת לאף ליגה בענף הזה.")}
                  </EmptyState>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flat-section">
          <button
            type="button"
            className="settings-row collapsible-toggle"
            onClick={() => setShowOpenLeagues((v) => !v)}
          >
            <h2>{t("ליגות פתוחות")} ({openLeagues.length})</h2>
            <span className="muted">{showOpenLeagues ? t("הסתר") : t("הצג")}</span>
          </button>

          {showOpenLeagues && (
            <div className="league-grid" style={{ marginTop: 14 }}>
              {loading ? (
                <>
                  <SkeletonLeagueCard />
                  <SkeletonLeagueCard />
                </>
              ) : (
                openLeagues.map((league) => (
                  <LeagueCard league={league} key={league.id} isMember={myLeagueIds.has(league.id)} />
                ))
              )}
              {!loading && openLeagues.length === 0 && (
                <EmptyState icon={<TrophyIcon aria-hidden="true" />}>
                  {t("אין כרגע ליגות פתוחות.")}
                </EmptyState>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
