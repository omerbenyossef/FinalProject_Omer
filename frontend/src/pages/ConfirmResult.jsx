import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { formatWeekdayTime, hasHebrewChars } from "../matchUtils.js";

function rankLabel(n) {
  return n != null ? `#${n}` : "—";
}

export default function ConfirmResult() {
  const { matchId } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getMatchDetail(matchId)
      .then(setDetail)
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
          <span className="sched-nav-label">{t("CONFIRM RESULT")}</span>
        </div>
        <SkeletonBar width={200} height={32} style={{ marginTop: 18 }} />
      </div>
    );
  }

  const sets = detail.corrected_sets ?? detail.reported_sets ?? [];
  const isRound2 = detail.corrected_sets != null;
  const mySets = sets.map((s) => s.player1_games);
  const oppSets = sets.map((s) => s.player2_games);
  const noThirdSet = detail.max_sets >= 3 && sets.length < 3;
  const isNotPlayedClaim = detail.void_reason === "not_played" && detail.corrected_sets == null;

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      await api.confirmMatchResult(matchId);
      navigate(-1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleWrong() {
    if (isRound2) {
      setBusy(true);
      setError("");
      try {
        await api.rejectMatchCorrection(matchId);
        navigate(-1);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    } else {
      navigate(`/matches/${matchId}/correct`);
    }
  }

  if (detail.result_status !== "pending_you") {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">{t("CONFIRM RESULT")}</span>
        </div>
        <h1 className="sched-title">{t("מול {name}", { name: detail.opponent.name })}</h1>
        <p className="sched-waiting">
          {detail.result_status === "disputed"
            ? detail.void_reason === "not_played"
              ? t("המשחק לא בוצע")
              : t("DISPUTED")
            : detail.result_status === "final"
            ? t("התוצאה כבר אושרה")
            : t("WAITING FOR HIM")}
        </p>
      </div>
    );
  }

  if (isNotPlayedClaim) {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">{t("CONFIRM RESULT")}</span>
        </div>

        <h1 className="sched-title">{t("{name} מדווח/ת שהמשחק לא בוצע", { name: detail.opponent.name })}</h1>
        <p className="sched-sub" dir="ltr">
          {detail.scheduled_at && formatWeekdayTime(new Date(detail.scheduled_at))}
        </p>

        {error && <p className="error">{t(error)}</p>}

        <div className="sched-bottom">
          <button type="button" className="res-confirm" disabled={busy} onClick={handleConfirm}>
            {t("מאשר, המשחק לא בוצע")}
          </button>
          <button type="button" className="res-wrong-link" disabled={busy} onClick={handleWrong}>
            {t("לא, המשחק כן בוצע")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("CONFIRM RESULT")}</span>
      </div>

      <h1 className="sched-title">{t("{name} דיווח", { name: detail.opponent.name })}</h1>
      <p className="sched-sub" dir="ltr">
        {detail.round_number ? (
          <>
            {hasHebrewChars(detail.league_name) ? (
              <span className="sched-sub-sans" dir="auto" style={{ unicodeBidi: "isolate" }}>
                {detail.league_name}
              </span>
            ) : (
              detail.league_name?.toUpperCase()
            )}{" "}
            · R{detail.round_number}
          </>
        ) : (
          "FRIENDLY"
        )}
        {detail.scheduled_at && ` · ${formatWeekdayTime(new Date(detail.scheduled_at))}`}
      </p>

      {error && <p className="error">{t(error)}</p>}

      <div className="res-score">
        <div className="res-score-row res-score-me">
          <span className="res-score-name">{t("את/ה")}</span>
          <div className="res-score-sets" dir="ltr">
            {mySets.map((g, i) => (
              <span className="res-score-cell" key={i}>
                {g}
              </span>
            ))}
          </div>
        </div>
        <div className="res-score-row">
          <span className="res-score-name" dir="auto" style={{ unicodeBidi: "isolate" }}>
            {detail.opponent.name}
          </span>
          <div className="res-score-sets" dir="ltr">
            {oppSets.map((g, i) => (
              <span className="res-score-cell" key={i}>
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="res-score-meta" dir="ltr">
        SETS {mySets.filter((g, i) => g > oppSets[i]).length}-{oppSets.filter((g, i) => g > mySets[i]).length}
        {noThirdSet && ` · NO THIRD SET REPORTED`}
      </p>

      {detail.prediction && (
        <div className="res-predict">
          <div className="res-predict-label">{t("IF YOU CONFIRM")}</div>
          <div className="res-predict-row">
            <span>{t("YOUR RECORD")}</span>
            <span dir="ltr">
              {detail.prediction.my_wins_before}-{detail.prediction.my_losses_before} →{" "}
              {detail.prediction.my_wins_after}-{detail.prediction.my_losses_after}
            </span>
          </div>
          <div className="res-predict-row">
            <span>{t("YOUR PLACE")}</span>
            <span dir="ltr">
              {rankLabel(detail.prediction.my_rank_before)} → {rankLabel(detail.prediction.my_rank_after)}
            </span>
          </div>
          <div className="res-predict-row">
            <span>{t("POINTS")}</span>
            <span dir="ltr">
              {detail.prediction.my_points_before} → {detail.prediction.my_points_after}
            </span>
          </div>
          <div className="res-predict-row">
            <span>{t("HEAD TO HEAD")}</span>
            <span dir="ltr">
              {detail.prediction.h2h_wins_before}-{detail.prediction.h2h_losses_before} →{" "}
              {detail.prediction.h2h_wins_after}-{detail.prediction.h2h_losses_after}
            </span>
          </div>
        </div>
      )}

      <div className="sched-bottom">
        <button type="button" className="res-confirm" disabled={busy} onClick={handleConfirm}>
          {t("אישור התוצאה")}
        </button>
        <button type="button" className="res-wrong-link" disabled={busy} onClick={handleWrong}>
          {t("התוצאה לא נכונה")}
        </button>
      </div>
    </div>
  );
}
