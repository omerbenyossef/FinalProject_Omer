import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";

export default function JoinByCode() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const league = await api.resolveJoinCode(code.trim());
      navigate(`/leagues/${league.id}?code=${code.trim()}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("יש לי קוד הזמנה")}</span>
      </div>

      <h1 className="sched-title">{t("הזן קוד הזמנה")}</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          className="lp-code-input"
          dir="ltr"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
          placeholder="XXXXXX"
          autoFocus
        />
        {error && <p className="error">{t(error)}</p>}
        <div className="sched-bottom">
          <button type="submit" className="sched-send" disabled={busy || code.length !== 6}>
            {busy ? t("מצטרף...") : t("הצטרפות לליגה")}
          </button>
        </div>
      </form>
    </div>
  );
}
