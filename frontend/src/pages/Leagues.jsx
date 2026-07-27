import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";

function LeagueCard({ league, isMember }) {
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

export default function Leagues() {
  const [leagues, setLeagues] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showMyLeagues, setShowMyLeagues] = useState(false);
  const [showOpenLeagues, setShowOpenLeagues] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sportId, setSportId] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  async function loadData() {
    setLoading(true);
    try {
      const [leaguesData, sportsData] = await Promise.all([api.listLeagues(), api.listSports()]);
      setLeagues(leaguesData);
      setSports(sportsData);
      if (sportsData.length && !sportId) setSportId(String(sportsData[0].id));

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
      await api.createLeague({ name, description, sport_id: Number(sportId), is_open: isOpen });
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

  const openLeagues = leagues.filter((l) => l.is_open);
  const myLeagueIds = new Set(myLeagues.map((l) => l.id));

  return (
    <div>
      <div className="page-header">
        <h1>ליגות פעילות</h1>
        {user && (
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "ביטול" : "+ יצירת ליגה"}
          </button>
        )}
      </div>

      {!user && <p className="muted">רוצה להקים ליגה? יש להירשם או להתחבר קודם.</p>}

      {showForm && (
        <form className="card form-card" onSubmit={handleCreate}>
          <label>
            שם הליגה
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            ענף ספורט
            <select value={sportId} onChange={(e) => setSportId(e.target.value)} required>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            תיאור (אופציונלי)
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {user?.is_admin && (
            <label style={{ flexDirection: "row-reverse", justifyContent: "flex-end", gap: 8 }}>
              <input
                type="checkbox"
                checked={isOpen}
                onChange={(e) => setIsOpen(e.target.checked)}
                style={{ width: "auto" }}
              />
              ליגה פתוחה (כל אחד יכול להצטרף בלי קוד הזמנה)
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "יוצר..." : "צור ליגה"}
          </button>
        </form>
      )}

      {error && !showForm && <p className="error">{error}</p>}

      {loading && <p className="muted">טוען...</p>}

      {user && (
        <section className="card">
          <button
            type="button"
            className="settings-row collapsible-toggle"
            onClick={() => setShowMyLeagues((v) => !v)}
          >
            <h2>הליגות שלי ({myLeagues.length})</h2>
            <span className="muted">{showMyLeagues ? "הסתר" : "הצג"}</span>
          </button>

          {showMyLeagues && (
            <div className="league-grid" style={{ marginTop: 14 }}>
              {myLeagues.map((league) => (
                <LeagueCard league={league} key={league.id} />
              ))}
              {!loading && myLeagues.length === 0 && (
                <p className="muted">עדיין לא הצטרפת לאף ליגה.</p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <button
          type="button"
          className="settings-row collapsible-toggle"
          onClick={() => setShowOpenLeagues((v) => !v)}
        >
          <h2>ליגות פתוחות ({openLeagues.length})</h2>
          <span className="muted">{showOpenLeagues ? "הסתר" : "הצג"}</span>
        </button>

        {showOpenLeagues && (
          <div className="league-grid" style={{ marginTop: 14 }}>
            {openLeagues.map((league) => (
              <LeagueCard league={league} key={league.id} isMember={myLeagueIds.has(league.id)} />
            ))}
            {!loading && openLeagues.length === 0 && (
              <p className="muted">אין כרגע ליגות פתוחות.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
