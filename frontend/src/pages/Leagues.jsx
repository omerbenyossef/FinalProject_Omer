import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";

export default function Leagues() {
  const [leagues, setLeagues] = useState([]);
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sportId, setSportId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  async function loadData() {
    setLoading(true);
    try {
      const [leaguesData, sportsData] = await Promise.all([api.listLeagues(), api.listSports()]);
      setLeagues(leaguesData);
      setSports(sportsData);
      if (sportsData.length && !sportId) setSportId(String(sportsData[0].id));
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
      await api.createLeague({ name, description, sport_id: Number(sportId) });
      setName("");
      setDescription("");
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

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
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "יוצר..." : "צור ליגה"}
          </button>
        </form>
      )}

      {error && !showForm && <p className="error">{error}</p>}

      {loading && <p className="muted">טוען...</p>}

      <div className="league-grid">
        {leagues.map((league) => (
          <Link to={`/leagues/${league.id}`} key={league.id} className="card league-card">
            <span className="sport-tag">{league.sport.name}</span>
            <h3>{league.name}</h3>
            {league.description && <p className="muted">{league.description}</p>}
            <p className="member-count">{league.member_count} שחקנים</p>
          </Link>
        ))}
        {!loading && leagues.length === 0 && (
          <p className="muted">עדיין אין ליגות. היו הראשונים להקים אחת!</p>
        )}
      </div>
    </div>
  );
}
