import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { formatSets } from "../matchUtils.js";

export default function CorrectScore() {
  const { matchId } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);
  const [theirs, setTheirs] = useState([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    api
      .getMatchDetail(matchId)
      .then((data) => {
        setDetail(data);
        const n = data.max_sets || 3;
        setMine(Array(n).fill(""));
        setTheirs(Array(n).fill(""));
      })
      .catch((err) => setError(err.message));
  }, [matchId]);

  if (error) return <p className="error">{t(error)}</p>;

  if (!detail) {
    return (
      <div>
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">{t("CORRECT THE SCORE")}</span>
        </div>
        <SkeletonBar width={200} height={32} style={{ marginTop: 18 }} />
      </div>
    );
  }

  const reported = detail.reported_sets || [];
  const numSets = mine.length;
  const filledCount = mine.filter((v, i) => v !== "" && theirs[i] !== "").length;
  const isValid = filledCount >= 1 && mine.slice(0, filledCount).every((v) => v !== "") && theirs.slice(0, filledCount).every((v) => v !== "");

  function updateMine(i, value) {
    setMine((prev) => prev.map((v, idx) => (idx === i ? value.replace(/\D/g, "") : v)));
  }
  function updateTheirs(i, value) {
    setTheirs((prev) => prev.map((v, idx) => (idx === i ? value.replace(/\D/g, "") : v)));
  }

  async function handleSubmit() {
    const sets = [];
    for (let i = 0; i < numSets; i++) {
      if (mine[i] === "" || theirs[i] === "") continue;
      sets.push({ player1_games: Number(mine[i]), player2_games: Number(theirs[i]) });
    }
    if (sets.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await api.disputeMatchResult(matchId, sets, note.trim() || null);
      navigate(-1);
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
        <span className="sched-nav-label">{t("CORRECT THE SCORE")}</span>
      </div>

      <h1 className="sched-title">{t("מה הייתה התוצאה")}</h1>
      <p className="sched-sub" dir="ltr">
        {reported.length > 0
          ? t("HE REPORTED {sets} TO HIM", { sets: formatSets(reported) })
          : t("הצד השני דיווח שהמשחק לא בוצע — מה הייתה התוצאה בפועל?")}
      </p>

      {error && <p className="error">{t(error)}</p>}

      <div className="corr-table">
        <div className="corr-row corr-header">
          <span className="corr-name" />
          {Array.from({ length: numSets }, (_, i) => (
            <span className="corr-cell corr-head-cell" key={i}>
              SET {i + 1}
            </span>
          ))}
        </div>
        <div className="corr-row">
          <span className="corr-name">{t("את/ה")}</span>
          {mine.map((v, i) => (
            <input
              key={i}
              type="text"
              inputMode="numeric"
              maxLength={2}
              className="corr-input"
              value={v}
              placeholder="–"
              onChange={(e) => updateMine(i, e.target.value)}
            />
          ))}
        </div>
        <div className="corr-row">
          <span className="corr-name">
            <span dir="auto" style={{ unicodeBidi: "isolate" }}>{detail.opponent.name}</span>
          </span>
          {theirs.map((v, i) => (
            <input
              key={i}
              type="text"
              inputMode="numeric"
              maxLength={2}
              className="corr-input"
              value={v}
              placeholder="–"
              onChange={(e) => updateTheirs(i, e.target.value)}
            />
          ))}
        </div>
        <div className="corr-row corr-reported">
          <span className="corr-name">{t("HE REPORTED")}</span>
          {Array.from({ length: numSets }, (_, i) => (
            <span className="corr-cell" key={i}>
              {reported[i] ? `${reported[i].player1_games}-${reported[i].player2_games}` : "—"}
            </span>
          ))}
        </div>
      </div>

      <div className="corr-note-label">{t("NOTE FOR HIM · OPTIONAL")}</div>
      <input
        type="text"
        className="corr-note-input"
        dir="rtl"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="sched-bottom">
        <button type="button" className="sched-send" disabled={!isValid || busy} onClick={handleSubmit}>
          {t("שלח תיקון")}
        </button>
        <p className="sched-pending">{t("HE CONFIRMS · THEN IT COUNTS")}</p>
      </div>
    </div>
  );
}
