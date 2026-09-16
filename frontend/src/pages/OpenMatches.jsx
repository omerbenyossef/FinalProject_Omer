import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { useOpenAction } from "../OpenActionContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import SetScoreForm from "../SetScoreForm.jsx";

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

function playedOn(item) {
  if (!item.played_on) return "";
  const d = new Date(item.played_on);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Which competition the match belonged to. Without it a row is just a name and
// a date, and a league match reads like a friendly.
function Frame({ item, t }) {
  if (!item.league_name) return <span className="om-frame">{t("משחק ידידותי")}</span>;
  return (
    <span className="om-frame">
      <span dir="auto" style={{ unicodeBidi: "isolate" }}>
        {item.league_name}
      </span>
      {item.round ? ` · ${t("מחזור {n}", { n: item.round })}` : ""}
    </span>
  );
}

// How long a report has been waiting, as the clause that closes the sentence.
function sentClause(item, t) {
  const days = item.days_waiting;
  if (days == null) return "";
  if (days <= 0) return t(" — נשלח היום.");
  if (days === 1) return t(" — נשלח לפני יום.");
  if (days === 2) return t(" — נשלח לפני יומיים.");
  return t(" — נשלח לפני {n} ימים.", { n: days });
}

// The server sends the sentence as a template — it doesn't know which
// language the reader picked. The name and the waiting clause go in through
// t(), and the score is placed as an isolated LTR run so "6-4 6-3" doesn't
// reverse inside the Hebrew.
function renderBody(item, t) {
  const sentence = t(item.body, {
    name: item.opponent_name,
    sent: sentClause(item, t),
  });
  return sentence.split("{score}").flatMap((part, i) =>
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
  // Which row has its score form open. A match from a closed round is
  // reported here, on the screen that's asking for the report.
  const [reportingId, setReportingId] = useState(null);

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
      setReportingId(null);
      load();
      reloadOpenAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  // Sets are stored in the match's own player1/player2 order; the form always
  // puts the viewer first.
  function reportScore(item, sets) {
    const asMatch = item.i_am_player1
      ? sets
      : sets.map((set) => ({ player1_games: set.player2_games, player2_games: set.player1_games }));
    return item.league_id
      ? api.reportScore(item.league_id, item.match_id, asMatch)
      : api.reportFriendlyScore(item.match_id, asMatch, true);
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
                  <div className="om-titles">
                    <div className="om-card-top">
                      <Avatar
                        name={item.opponent_name}
                        photoUrl={item.opponent_photo_url}
                        size={28}
                      />
                      <span className="om-name">{item.opponent_name}</span>
                      <span className="om-meta" dir="ltr">
                        {playedOn(item)}
                      </span>
                    </div>
                    <Frame item={item} t={t} />
                  </div>
                  <p className="om-body-line">{renderBody(item, t)}</p>

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
                  ) : item.state === "not_played_void" ? (
                    <>
                      <div className="om-note">
                        <span className="om-note-label">{t("אם לא תתאמו אותו למחזור אחר")}</span>
                        <p className="om-note-text">
                          {t(
                            "המשחק לא ייספר בטבלה, ושניכם תסיימו את המחזור עם משחק אחד פחות — בלי ניצחון לאף אחד."
                          )}
                        </p>
                      </div>
                      <div className="om-actions">
                        <button
                          type="button"
                          className="om-primary"
                          onClick={() => navigate(`/matches/${item.match_id}/reschedule`)}
                        >
                          {t("תיאום במחזור אחר")}
                        </button>
                      </div>
                    </>
                  ) : item.state === "unreported" ? (
                    reportingId === item.match_id ? (
                      <SetScoreForm
                        player1Name={item.i_am_player1 ? t("אתה") : item.opponent_name}
                        player2Name={item.i_am_player1 ? item.opponent_name : t("אתה")}
                        busy={busyId === item.match_id}
                        maxSets={item.max_sets}
                        onSubmit={(sets) => run(item.match_id, () => reportScore(item, sets))}
                        onCancel={() => setReportingId(null)}
                      />
                    ) : (
                      <div className="om-actions">
                        <button
                          type="button"
                          className="om-primary"
                          disabled={busyId === item.match_id}
                          onClick={() => setReportingId(item.match_id)}
                        >
                          {t("דווח תוצאה")}
                        </button>
                        <button
                          type="button"
                          className="om-secondary"
                          disabled={busyId === item.match_id}
                          onClick={() => run(item.match_id, () => api.reportMatchNotPlayed(item.match_id))}
                        >
                          {t("המשחק לא בוצע")}
                        </button>
                      </div>
                    )
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
                  <div className="om-titles">
                    <div className="om-card-top">
                      <Avatar
                        name={item.opponent_name}
                        photoUrl={item.opponent_photo_url}
                        size={28}
                      />
                      <span className="om-row-name">{item.opponent_name}</span>
                      <span className="om-meta" dir="ltr">
                        {playedOn(item)}
                      </span>
                    </div>
                    <Frame item={item} t={t} />
                  </div>
                  <p className="om-row-line">{renderBody(item, t)}</p>
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
          {t("תוצאה שדווחה ולא אושרה נסגרת אוטומטית אחרי 72 שעות, לפי הדיווח.")}
        </div>
      )}
    </div>
  );
}
