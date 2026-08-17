import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";

function minDateTimeLocal() {
  const now = new Date(Date.now() + 60000);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ScheduleForm({ onSubmit, onCancel, busy }) {
  const [value, setValue] = useState("");
  const { t } = useLanguage();

  function handleSubmit(e) {
    e.preventDefault();
    if (!value) return;
    onSubmit(new Date(value).toISOString());
  }

  return (
    <form onSubmit={handleSubmit} className="schedule-form">
      <input
        type="datetime-local"
        className="schedule-form-input"
        value={value}
        min={minDateTimeLocal()}
        onChange={(e) => setValue(e.target.value)}
        required
      />
      <div className="score-actions">
        <button type="submit" className="score-submit" disabled={!value || busy}>
          <span className="score-submit-dot" aria-hidden="true" />
          {busy ? t("שולח...") : t("הצע שעה")}
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
