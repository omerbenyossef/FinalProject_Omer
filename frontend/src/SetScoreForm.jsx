import { useState } from "react";

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
}) {
  const [rows, setRows] = useState(() => initialRows(initialSets));

  function updateRow(index, key, value) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { p1: "", p2: "" }]);
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
          <span className="muted set-score-label">סט {index + 1}</span>
          <input
            type="number"
            min="0"
            placeholder={player1Name}
            value={row.p1}
            onChange={(e) => updateRow(index, "p1", e.target.value)}
            required
          />
          <span>:</span>
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
              הסר
            </button>
          )}
        </div>
      ))}

      <div className="inline-form">
        <button type="button" className="link-btn" onClick={addRow}>
          + הוסף סט
        </button>
        <button type="submit" className="btn-secondary" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="link-btn" onClick={onCancel}>
            ביטול
          </button>
        )}
      </div>
    </form>
  );
}
