import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";

function initialRows(sets) {
  if (sets && sets.length > 0) {
    return sets.map((s) => ({ p1: String(s.player1_games), p2: String(s.player2_games) }));
  }
  return [{ p1: "", p2: "" }];
}

export default function SetScoreForm({
  player1Name,
  player2Name,
  initialSets,
  onSubmit,
  onCancel,
  busy,
  submitLabel = "דווח תוצאה",
  maxSets,
}) {
  const [rows, setRows] = useState(() => initialRows(initialSets));
  const { t } = useLanguage();

  function updateRow(index, key, value) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function addRow() {
    setRows((prev) => (maxSets && prev.length >= maxSets ? prev : [...prev, { p1: "", p2: "" }]));
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const sets = rows.map((row) => ({
      player1_games: Number(row.p1),
      player2_games: Number(row.p2),
    }));
    onSubmit(sets);
  }

  return (
    <form onSubmit={handleSubmit} className="set-score-form">
      {rows.map((row, index) => (
        <div className="set-score-row" key={index}>
          <span className="set-score-label">{t("מערכה {n}", { n: index + 1 })}</span>
          <input
            type="number"
            min="0"
            placeholder={player1Name}
            value={row.p1}
            onChange={(e) => updateRow(index, "p1", e.target.value)}
            required
          />
          <span className="set-score-colon">:</span>
          <input
            type="number"
            min="0"
            placeholder={player2Name}
            value={row.p2}
            onChange={(e) => updateRow(index, "p2", e.target.value)}
            required
          />
          {rows.length > 1 && (
            <button
              type="button"
              className="link-btn"
              style={{ color: "var(--danger)" }}
              onClick={() => removeRow(index)}
            >
              {t("הסר")}
            </button>
          )}
        </div>
      ))}

      {(!maxSets || rows.length < maxSets) && (
        <div className="inline-form">
          <button type="button" className="link-btn" onClick={addRow}>
            {t("+ הוסף סט")}
          </button>
        </div>
      )}

      <div className="set-score-actions">
        <button type="submit" className="btn-score-save" disabled={busy}>
          {t(submitLabel)}
        </button>
        {onCancel && (
          <button type="button" className="btn-score-cancel" onClick={onCancel}>
            {t("ביטול")}
          </button>
        )}
      </div>
    </form>
  );
}
