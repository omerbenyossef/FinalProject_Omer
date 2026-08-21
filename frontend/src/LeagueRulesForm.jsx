import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import { NTRP_STEPS } from "./matchUtils.js";
import { getCurrentPosition } from "./geo.js";

export default function LeagueRulesForm({ league, onUpdate, onCancel }) {
  const { t } = useLanguage();
  const [bestOf, setBestOf] = useState(league.best_of);
  const [roundLengthDays, setRoundLengthDays] = useState(league.round_length_days);
  const [levelMin, setLevelMin] = useState(league.level_min ?? 1.5);
  const [levelMax, setLevelMax] = useState(league.level_max ?? 5.5);
  const [capacity, setCapacity] = useState(league.capacity != null ? String(league.capacity) : "");
  const [startsAt, setStartsAt] = useState(
    league.starts_at ? new Date(league.starts_at).toISOString().slice(0, 10) : ""
  );
  const [locationName, setLocationName] = useState(league.location_name ?? "");
  const [plannedRounds, setPlannedRounds] = useState(
    league.planned_rounds != null ? String(league.planned_rounds) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const locationChanged = locationName.trim() !== (league.location_name ?? "");
      const position = locationChanged ? await getCurrentPosition() : null;
      await onUpdate({
        best_of: bestOf,
        round_length_days: roundLengthDays,
        level_min: levelMin,
        level_max: levelMax,
        capacity: capacity.trim() ? Number(capacity) : null,
        clear_capacity: !capacity.trim(),
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        clear_starts_at: !startsAt,
        location_name: locationName.trim() || null,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        planned_rounds: plannedRounds.trim() ? Number(plannedRounds) : null,
        clear_planned_rounds: !plannedRounds.trim(),
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
          {NTRP_STEPS.map((v) => (
            <option key={v} value={v}>
              {v.toFixed(1)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("רמה מקסימלית (NTRP)")}
        <select value={levelMax} onChange={(e) => setLevelMax(Number(e.target.value))}>
          {NTRP_STEPS.filter((v) => v >= levelMin).map((v) => (
            <option key={v} value={v}>
              {v.toFixed(1)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("קיבולת (אופציונלי)")}
        <input
          type="number"
          min="2"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder={t("ללא הגבלה")}
        />
      </label>
      <label>
        {t("תאריך פתיחה (אופציונלי)")}
        <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </label>
      <label>
        {t("מיקום (אופציונלי)")}
        <input
          type="text"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder={t("לדוגמה: רמת גן")}
          maxLength={40}
        />
      </label>
      <label>
        {t("מספר מחזורים מתוכנן (אופציונלי)")}
        <input
          type="number"
          min="1"
          value={plannedRounds}
          onChange={(e) => setPlannedRounds(e.target.value)}
          placeholder={t("ללא הגבלה")}
        />
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
