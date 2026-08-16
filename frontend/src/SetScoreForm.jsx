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

  function handleSubmit(e) {
    e.preventDefault();
    const sets = rows.map((row) => ({
      player1_games: Number(row.p1),
      player2_games: Number(row.p2),
    }));
    onSubmit(sets);
  }

  const isValid = rows.every((row) => row.p1 !== "" && row.p2 !== "");

  return (
    <form onSubmit={handleSubmit} className="score-form">
      <div className="score-head">
        <span className="score-head-spacer" />
        <span className="score-head-name">
          <span dir="auto">{player1Name}</span>
        </span>
        <span className="score-head-name">
          <span dir="auto">{player2Name}</span>
        </span>
      </div>

      {rows.map((row, index) => (
        <div className="score-row" key={index}>
          <span className="score-row-label">{t("סט {n}", { n: index + 1 })}</span>
          <input
            className="score-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={row.p1}
            placeholder="–"
            onChange={(e) => updateRow(index, "p1", e.target.value.replace(/\D/g, ""))}
          />
          <input
            className="score-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={row.p2}
            placeholder="–"
            onChange={(e) => updateRow(index, "p2", e.target.value.replace(/\D/g, ""))}
          />
        </div>
      ))}

      {(!maxSets || rows.length < maxSets) && (
        <button type="button" className="score-add" onClick={addRow}>
          + {t("הוסף סט")}
        </button>
      )}

      <div className="score-actions">
        <button type="submit" className="score-submit" disabled={!isValid || busy}>
          <span className="score-submit-dot" aria-hidden="true" />
          {busy ? t("שולח...") : t(submitLabel)}
        </button>
        {onCancel && (
          <button type="button" className="score-cancel" onClick={onCancel}>
            {t("ביטול")}
          </button>
        )}
      </div>
    </form>
  );
}
