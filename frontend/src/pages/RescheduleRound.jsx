import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { useAuth } from "../AuthContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { hasHebrewChars, weekdayShort } from "../matchUtils.js";

function dayMonth(value) {
  const date = new Date(value);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// A match both players agreed was never played is voided, but the pairing is
// still owed — this is where they put it in a later round and start over.
export default function RescheduleRound() {
  const { matchId } = useParams();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { reload: reloadOpenAction } = useOpenAction();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [rounds, setRounds] = useState(null);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gone, setGone] = useState(false);

  useEffect(() => {
    api.getMatchDetail(matchId).then(setDetail).catch((err) => setError(err.message));
    api
      .rescheduleRounds(matchId)
      .then((data) => {
        setRounds(data);
        setPicked(data.options[0]?.number ?? null);
      })
      .catch((err) => {
        // The match isn't in that state (any more) — nothing to pick here.
        if (err.status === 400) setGone(true);
        else setError(err.message);
      });
  }, [matchId]);

  if (gone) return <Navigate to={`/matches/${matchId}`} replace />;
  if (error && !rounds) return <p className="error">{t(error)}</p>;

  if (!rounds) {
    return (
      <div className="rr">
        <div className="rr-head">
          <button type="button" className="rr-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <SkeletonBar width={220} height={26} style={{ marginTop: 26 }} />
        </div>
      </div>
    );
  }

  const name = detail?.opponent?.name ?? "";
  const options = rounds.options ?? [];

  // Two ways a match ends up voided: both sides said so, or one said so and
  // the other never answered. The screen says which.
  const intro = (() => {
    const tail = t("המשחק לא נספר בטבלה. אפשר לתאם אותו למחזור משחקים אחר.");
    if (!detail) return tail;
    if (detail.confirmed_by != null) return `${t("דווח משני הצדדים שהמשחק לא שוחק.")} ${tail}`;
    if (detail.reported_by === user?.id)
      return `${t("דיווחת שהמשחק לא שוחק ולא הייתה תגובה מ{name}.", { name })} ${tail}`;
    return `${t("{name} דיווח/ה שהמשחק לא שוחק ולא הגבת.", { name })} ${tail}`;
  })();

  const metaParts = [
    detail?.league_name ? (
      <span key="league" dir={hasHebrewChars(detail.league_name) ? "rtl" : "ltr"}>
        {detail.league_name}
      </span>
    ) : null,
    rounds.original_round ? <span key="round">{t("מחזור {n}", { n: rounds.original_round })}</span> : null,
    detail?.scheduled_at ? (
      <span key="date">
        {weekdayShort(new Date(detail.scheduled_at), t)} {dayMonth(detail.scheduled_at)}
      </span>
    ) : null,
  ].filter(Boolean);

  async function submit() {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      await api.rescheduleToRound(matchId, picked);
      reloadOpenAction();
      // The match is a plain unscheduled league match now, so hand them
      // straight to the time it still needs.
      navigate(`/matches/${matchId}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="rr">
      <div className="rr-head">
        <button type="button" className="rr-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <h1 className="rr-title">
          {name ? t("המשחק מול {name} לא שוחק", { name }) : t("המשחק לא שוחק")}
        </h1>
        {metaParts.length > 0 && (
          <div className="rr-meta" dir="ltr">
            {metaParts.map((part, i) => (
              <span className="rr-meta-part" key={i}>
                {i > 0 && <span className="rr-dot">·</span>}
                {part}
              </span>
            ))}
          </div>
        )}
        <p className="rr-intro">{intro}</p>
      </div>

      {error && <p className="rr-error error">{t(error)}</p>}

      {options.length === 0 ? (
        <p className="rr-empty">{t("אין מחזור פנוי להעביר אליו את המשחק")}</p>
      ) : (
        <>
          <div className="rr-section">{t("לאיזה מחזור להעביר?")}</div>
          <div className="rr-options">
            {options.map((option) => (
              <button
                type="button"
                className={`rr-option${picked === option.number ? " is-picked" : ""}`}
                key={option.number}
                onClick={() => setPicked(option.number)}
              >
                <span className="rr-option-main">
                  <span className="rr-option-name">{t("מחזור {n}", { n: option.number })}</span>
                  {option.starts_at && option.ends_at && (
                    <span className="rr-option-dates" dir="ltr">
                      {dayMonth(option.starts_at)} – {dayMonth(option.ends_at)}
                    </span>
                  )}
                </span>
                <span className="rr-option-load">
                  {option.my_matches === 0
                    ? t("אין לך משחק אחר במחזור הזה")
                    : option.my_matches === 1
                      ? t("יש לך עוד משחק אחד במחזור הזה")
                      : t("יש לך עוד {n} משחקים במחזור הזה", { n: option.my_matches })}
                </span>
              </button>
            ))}
          </div>

          <div className="rr-actions">
            <button
              type="button"
              className="rr-btn rr-btn--primary"
              disabled={busy || !picked}
              onClick={submit}
            >
              {t("העבר למחזור {n}", { n: picked ?? "" })}
            </button>
            <p className="rr-foot">{t("אחרי ההעברה תקבעו שעה כמו בכל משחק אחר.")}</p>
          </div>
        </>
      )}
    </div>
  );
}
