import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";

// open-matches-156a: the count is spoken as a word inside the sentence, not
// printed as a digit.
const COUNT_WORDS = [
  null,
  null,
  "שני משחקים",
  "שלושה משחקים",
  "ארבעה משחקים",
  "חמישה משחקים",
  "שישה משחקים",
  "שבעה משחקים",
  "שמונה משחקים",
  "תשעה משחקים",
  "עשרה משחקים",
];

function countPhrase(n, t) {
  if (n >= COUNT_WORDS.length || !COUNT_WORDS[n]) return t("{n} משחקים", { n });
  return t(COUNT_WORDS[n]);
}

function roundAndDate(item) {
  const parts = [];
  if (item.round) parts.push(`R${item.round}`);
  if (item.played_on) {
    const d = new Date(item.played_on);
    parts.push(`${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return parts.join(" · ");
}

// The sentence arrives finished; the score is the one value the client places,
// as an isolated LTR run so "6-4 6-3" doesn't reverse inside the Hebrew.
function renderBody(item) {
  return item.body.split("{score}").flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <span className="om-score" key={i} dir="ltr">
            {item.score}
          </span>,
          part,
        ]
  );
}

function remindedToday(item) {
  if (!item.reminder_sent_at) return false;
  return Date.now() - new Date(item.reminder_sent_at).getTime() < 24 * 3600 * 1000;
}

export default function OpenMatches() {
  const { t } = useLanguage();
  const { reload: reloadOpenAction } = useOpenAction();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api
      .openMatches()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  async function run(matchId, fn) {
    setBusyId(matchId);
    setError("");
    try {
      await fn();
      load();
      reloadOpenAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (error && !data) return <p className="error">{t(error)}</p>;

  if (!data) {
    return (
      <div className="om">
        <div className="om-head">
          <button type="button" className="om-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <SkeletonBar width={240} height={30} style={{ marginTop: 26 }} />
        </div>
      </div>
    );
  }

  const you = data.waiting_on_you ?? [];
  const them = data.waiting_on_them ?? [];
  const total = you.length + them.length;

  return (
    <div className="om">
      <div className="om-head">
        <button type="button" className="om-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>

        {total === 0 ? (
          <h1 className="om-title om-title--closed">{t("כל המשחקים שלך נסגרו")}</h1>
        ) : (
          <>
            <h1 className="om-title">{t("משחקים שעוד לא נסגרו")}</h1>
            <p className="om-intro">
              {total === 1
                ? t("משחק אחד ממחזורים קודמים עוד לא נספר בטבלה. עד שייסגר הוא לא משפיע על הדירוג.")
                : t(
                    "{count} ממחזורים קודמים עוד לא נספרו בטבלה. עד שהם ייסגרו הם לא משפיעים על הדירוג.",
                    { count: countPhrase(total, t) }
                  )}
            </p>
          </>
        )}
      </div>

      {error && <p className="om-error error">{t(error)}</p>}

      <div className="om-body">
        {you.length > 0 && (
          <>
            <div className="om-section">
              <span className="om-section-name">{t("מחכה לך")}</span>
              <span className="om-section-rule" />
              <span className="om-section-count lime" dir="ltr">
                {you.length}
              </span>
            </div>
            <div className="om-cards">
              {you.map((item) => (
                <div className="om-card" key={item.match_id}>
                  <div className="om-card-top">
                    <span className="om-name">{item.opponent_name}</span>
                    <span className="om-meta" dir="ltr">
                      {roundAndDate(item)}
                    </span>
                  </div>
                  <p className="om-body-line">{renderBody(item)}</p>

                  {item.state === "disputed" ? (
                    <div className="om-scores" dir="auto">
                      <div className="om-scores-row">
                        <span>{t("אתה")}</span>
                        <span className="om-score" dir="ltr">
                          {item.my_score}
                        </span>
                      </div>
                      <div className="om-scores-row">
                        <span>{item.opponent_name}</span>
                        <span className="om-score" dir="ltr">
                          {item.their_score}
                        </span>
                      </div>
                    </div>
                  ) : item.state === "unreported" ? (
                    <div className="om-actions">
                      <button
                        type="button"
                        className="om-primary"
                        disabled={busyId === item.match_id}
                        onClick={() => navigate(`/matches/${item.match_id}`)}
                      >
                        {t("דווח")}
                      </button>
                    </div>
                  ) : (
                    <div className="om-actions">
                      <button
                        type="button"
                        className="om-primary"
                        disabled={busyId === item.match_id}
                        onClick={() => run(item.match_id, () => api.confirmMatchResult(item.match_id))}
                      >
                        {t("אשר")}
                      </button>
                      <button
                        type="button"
                        className="om-secondary"
                        disabled={busyId === item.match_id}
                        onClick={() => navigate(`/matches/${item.match_id}/correct`)}
                      >
                        {t("לא מסכים")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {them.length > 0 && (
          <>
            <div className={`om-section${you.length > 0 ? " spaced" : ""}`}>
              <span className="om-section-name">{t("מחכה להם")}</span>
              <span className="om-section-rule" />
              <span className="om-section-count" dir="ltr">
                {them.length}
              </span>
            </div>
            <div className="om-rows">
              {them.map((item) => (
                <div className="om-row" key={item.match_id}>
                  <div className="om-card-top">
                    <span className="om-row-name">{item.opponent_name}</span>
                    <span className="om-meta" dir="ltr">
                      {roundAndDate(item)}
                    </span>
                  </div>
                  <p className="om-row-line">{renderBody(item)}</p>
                  {remindedToday(item) ? (
                    <span className="om-reminded">{t("תזכורת נשלחה היום")}</span>
                  ) : (
                    <button
                      type="button"
                      className="om-remind"
                      disabled={busyId === item.match_id}
                      onClick={() => run(item.match_id, () => api.remindOpenMatch(item.match_id))}
                    >
                      {t("שלח תזכורת")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {total > 0 && (
        <div className="om-foot">
          {t("תוצאה שדווחה ולא אושרה נסגרת אוטומטית אחרי 48 שעות, לפי הדיווח.")}
        </div>
      )}
    </div>
  );
}
