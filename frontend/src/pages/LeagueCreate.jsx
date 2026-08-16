import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";

export default function LeagueCreate() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { sports, selectedSportId } = useSport();
  const { t } = useLanguage();
  const sportName = sports.find((s) => s.id === selectedSportId)?.name;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const league = await api.createLeague({
        name: name.trim(),
        description: "",
        sport_id: selectedSportId,
        is_open: false,
        best_of: 3,
        round_length_days: 7,
      });
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Link to="/leagues" className="back-link">
        <ChevronIcon aria-hidden="true" />
        {t("ליגות")}
      </Link>
      <h1 className="create-title">{t("איך קוראים לליגה?")}</h1>
      {sportName && (
        <p className="create-sub">
          {t("{sport} · מחזור שבועי · עד 3 סטים. אפשר לשנות הכל אחר כך.", { sport: t(sportName) })}
        </p>
      )}
      <form onSubmit={handleCreate}>
        <input
          ref={inputRef}
          className="create-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={40}
          placeholder={t("שם הליגה")}
        />
        {error && <p className="error">{t(error)}</p>}
        <button
          type="submit"
          className="btn-create-league create-submit"
          disabled={submitting || !name.trim()}
        >
          {submitting ? t("יוצר...") : t("צור ליגה")}
        </button>
      </form>

      <div className="create-next-head">{t("מה קורה אחר כך")}</div>
      <ol className="create-next">
        <li>
          <span className="num">1</span>
          {t("הזמנת שחקנים בקישור")}
        </li>
        <li>
          <span className="num">2</span>
          {t("יצירת לוח משחקים כשכולם בפנים")}
        </li>
        <li>
          <span className="num">3</span>
          {t("משחקים ומדווחים תוצאות")}
        </li>
      </ol>
    </div>
  );
}
