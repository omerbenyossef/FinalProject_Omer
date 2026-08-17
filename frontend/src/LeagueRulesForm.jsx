import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";

const LEVEL_OPTIONS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5];

export default function LeagueRulesForm({ league, onUpdate, onCancel }) {
  const { t } = useLanguage();
  const [bestOf, setBestOf] = useState(league.best_of);
  const [roundLengthDays, setRoundLengthDays] = useState(league.round_length_days);
  const [levelMin, setLevelMin] = useState(league.level_min ?? 1.5);
  const [levelMax, setLevelMax] = useState(league.level_max ?? 5.5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onUpdate({
        best_of: bestOf,
        round_length_days: roundLengthDays,
        level_min: levelMin,
        level_max: levelMax,
      });
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
      <label>
        {t("רמה מינימלית (NTRP)")}
        <select
          value={levelMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            setLevelMin(v);
            if (v > levelMax) setLevelMax(v);
          }}
        >
          {LEVEL_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v.toFixed(1)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("רמה מקסימלית (NTRP)")}
        <select value={levelMax} onChange={(e) => setLevelMax(Number(e.target.value))}>
          {LEVEL_OPTIONS.filter((v) => v >= levelMin).map((v) => (
            <option key={v} value={v}>
              {v.toFixed(1)}
            </option>
          ))}
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
