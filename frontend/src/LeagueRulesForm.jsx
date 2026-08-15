import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";

export default function LeagueRulesForm({ league, onUpdate, onCancel }) {
  const { t } = useLanguage();
  const [bestOf, setBestOf] = useState(league.best_of);
  const [roundLengthDays, setRoundLengthDays] = useState(league.round_length_days);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onUpdate({ best_of: bestOf, round_length_days: roundLengthDays });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="league-rules-form" onSubmit={handleSubmit}>
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
      {error && <p className="error">{t(error)}</p>}
      <div className="inline-form">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? t("שומר...") : t("שמור")}
        </button>
        {onCancel && (
          <button type="button" className="link-btn" onClick={onCancel}>
            {t("ביטול")}
          </button>
        )}
      </div>
    </form>
  );
}
