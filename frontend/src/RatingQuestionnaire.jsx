import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useLanguage } from "./LanguageContext.jsx";
import { ChevronIcon } from "./Icons.jsx";
import { NTRP_STEPS } from "./matchUtils.js";

// Picking this q3 option ("College, national or professional") swaps the
// rally/serve questions for a single competitive-venue question — see
// playerlevelrating2.md, "Competitive players".
const COMPETITIVE_Q3_INDEX = 3;

const STANDARD_QUESTIONS = [
  {
    key: "q1",
    title: "כמה זמן את/ה משחק/ת {sport}?",
    options: ["פחות משנה", "1–3 שנים", "3–10 שנים", "יותר מ-10 שנים"],
  },
  {
    key: "q2",
    title: "כמה פעמים את/ה משחק/ת היום?",
    options: ["פעם בחודש או פחות", "פעם בשבוע-שבועיים", "כל שבוע", "2–3 פעמים בשבוע"],
  },
  {
    key: "q3",
    title: "שיחקת תחרותית?",
    options: [
      "אף פעם, רק משחקים חברתיים",
      "משחקי מועדון או מקומיים",
      "טורנירים אזוריים או מדורגים",
      "קולג', נבחרת לאומית או מקצוענות",
    ],
  },
  {
    key: "q4",
    title: "איך בדרך כלל נראים החילופים שלך במגרש?",
    options: [
      { label: "הנקודה נגמרת מהר", desc: "אני מכניס/ה את הכדור למשחק, ואז הוא יוצא ארוך או נכנס לרשת." },
      { label: "כמה כדורים הלוך ושוב", desc: "אני מצליח/ה לשמור על המשחק, אבל לא בוחר/ת איפה הכדור נוחת." },
      { label: "אני משחק/ת בנוחות ומכוון/ת", desc: "עשרה כדורים באלכסון זה לא בעיה, ואני בוחר/ת צד." },
      { label: "אני שולט/ת בחילופים", desc: "אני מזיז/ה את היריב/ה במגרש ובונה את הנקודה שאני רוצה." },
    ],
  },
  {
    key: "q5",
    title: "ומה עם ההגשה שלך?",
    options: [
      { label: "אני פשוט מכניס/ה אותה", desc: "מלמטה או איטית — הנקודה מתחילה, זה הכל." },
      { label: "נכנסת, אבל קורים דאבל פולטים", desc: "ההגשה הראשונה היא הימור, השנייה בטוחה." },
      { label: "הגשה ראשונה אמינה עם מהירות", desc: "רוב ההגשות הראשונות נכנסות, והן מפעילות לחץ." },
      { label: "ההגשה שלי מנצחת לי נקודות", desc: "אייסים והגשות שאי אפשר להחזיר הן חלק מהמשחק שלי." },
    ],
  },
  {
    key: "q6",
    title: "מה הכי מתאר אותך?",
    options: [
      { label: "אני עדיין לומד/ת את הבסיס", desc: "החילופים קצרים. אני עובד/ת על מגע נקי בכדור." },
      { label: "אני משחק/ת משחקים מלאים, אבל לא עקבי/ת", desc: "יש מכות טובות. אני לא מצליח/ה לחזור עליהן לפי דרישה." },
      { label: "אני מחזיק/ה מעמד במשחק אמיתי", desc: "אני שומר/ת על הכדור במשחק, שם אותו בערך איפה שאני רוצה, ויש לי תוכנית לנקודה." },
      { label: "אני בדרך כלל מנצח/ת את מי שאני משחק/ת מולם", desc: "רוב היריבים לא מצליחים ללחוץ עליי, ואני מחפש/ת משחקים חזקים יותר." },
      { label: "שיחקתי ברמה גבוהה", desc: "קולג', נבחרת לאומית, או טניס מקצועני." },
    ],
  },
];

const VENUE_QUESTION = {
  key: "venue",
  title: "איפה שיחקת תחרותית?",
  options: [
    { label: "ליגת מועדונים או אזורית", desc: "מדורג/ת מקומית, או בליגה הבכירה של מועדון." },
    { label: "נבחרת קולג' או נבחרת לאומית", desc: "NCAA, נבחרת לאומית, או תוכנית מקבילה." },
    { label: "סאטלייט, פיוצ'רס או נקודות ITF", desc: "שיחקתי על נקודות, או הייתי במסלול מקצועני." },
    { label: "רמת טור (Tour)", desc: "דירוג ATP/WTA, או שהתפרנסתי מהמשחק." },
  ],
};

function activeQuestions(answers) {
  return answers.q3 === COMPETITIVE_Q3_INDEX
    ? [...STANDARD_QUESTIONS.slice(0, 3), VENUE_QUESTION]
    : STANDARD_QUESTIONS;
}

function optionLabel(opt) {
  return typeof opt === "string" ? opt : opt.label;
}
function optionDesc(opt) {
  return typeof opt === "string" ? null : opt.desc;
}

export default function RatingQuestionnaire({ league, sportName, existingResult, joinCode, onClose, onJoined }) {
  const { t } = useLanguage();
  const [step, setStep] = useState(existingResult ? "result" : 0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(existingResult || null);
  const [submitting, setSubmitting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const questions = activeQuestions(answers);

  async function selectAnswer(qKey, index) {
    const next = { ...answers, [qKey]: index };
    setAnswers(next);
    const nextQuestions = activeQuestions(next);
    if (step < nextQuestions.length - 1) {
      setStep(step + 1);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload =
        next.q3 === COMPETITIVE_Q3_INDEX
          ? { q1: next.q1, q2: next.q2, q3: next.q3, venue: next.venue }
          : { q1: next.q1, q2: next.q2, q3: next.q3, q4: next.q4, q5: next.q5, q6: next.q6 };
      const res = await api.submitRating(league.id, payload);
      setResult(res);
      setStep("result");
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  async function handleJoinClick() {
    setJoining(true);
    setError("");
    try {
      await api.joinLeague(league.id, joinCode);
      onJoined();
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  }

  if (step === "result" && result) {
    return (
      <div className="rating-overlay">
        <button type="button" className="rating-back" onClick={onClose}>
          <ChevronIcon aria-hidden="true" />
        </button>

        <div className="rating-result-hero">
          <div className="rating-hero-num" dir="ltr">
            {result.level.toFixed(1)}
          </div>
          <div className="rating-hero-band">{t(result.band)}</div>
          <div className="rating-hero-meta" dir="ltr">
            NTRP · {t(sportName)} {result.provisional && <>· {t("זמני")}</>}
          </div>
        </div>

        <div className="rating-bar">
          {NTRP_STEPS.map((step_) => (
            <span
              key={step_}
              className={`rating-bar-step${Math.abs(step_ - result.level) < 0.01 ? " current" : ""}${
                step_ <= result.level ? " filled" : ""
              }`}
            />
          ))}
        </div>

        {result.in_range ? (
          <>
            <p className="rating-result-sentence">
              {t(bandSentence(result.band), { sport: t(sportName) })}
            </p>
            <Link to={`/leagues/${result.league_id}`} className="rating-league-row">
              <span className="rating-league-name">
                <span dir="auto">{result.league_name}</span>
              </span>
              <span className="rating-league-range" dir="ltr">
                NTRP {result.league_level_min.toFixed(1)}–{result.league_level_max.toFixed(1)}
              </span>
            </Link>
            {result.provisional && <p className="rating-provisional-note">{t("זמני למשך 3 משחקים")}</p>}

            {error && <p className="error">{t(error)}</p>}

            <button type="button" className="rating-primary-btn" onClick={handleJoinClick} disabled={joining}>
              {joining ? t("מצטרף...") : t("הצטרפ/י ל-{league}", { league: result.league_name })}
            </button>
            <Link to="/leagues" className="rating-secondary-link">
              {t("ליגות נוספות ברמה {min}–{max}", {
                min: result.league_level_min.toFixed(1),
                max: result.league_level_max.toFixed(1),
              })}
            </Link>
          </>
        ) : (
          <>
            <p className="rating-result-sentence">
              {t("{league} משחקת ברמה {min}–{max}", {
                league: result.league_name,
                min: result.league_level_min.toFixed(1),
                max: result.league_level_max.toFixed(1),
              })}
            </p>
            <p className="rating-result-sentence muted">
              {t(
                result.level > result.league_level_max
                  ? "מחזור שלם מול שחקנים ברמה {level} יהיה חד-צדדי מדי כדי להיות כיף."
                  : "מחזור שלם מול שחקנים ברמה {level} יסתיים כנראה בהפסדים רצופים.",
                {
                  level: (result.level > result.league_level_max
                    ? result.league_level_min
                    : result.league_level_max
                  ).toFixed(1),
                }
              )}
            </p>

            {result.other_leagues.length > 0 && (
              <div className="rating-other-leagues">
                {result.other_leagues.map((l) => (
                  <Link to={`/leagues/${l.id}`} key={l.id} className="rating-league-row">
                    <span className="rating-league-name">
                      <span dir="auto">{l.name}</span>
                    </span>
                    <span className="rating-league-range" dir="ltr">
                      NTRP {l.level_min.toFixed(1)}–{l.level_max.toFixed(1)}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <Link to="/leagues" className="rating-primary-btn rating-primary-link">
              {t("ליגות ברמה {min}–{max}", {
                min: Math.max(1.5, result.level - 0.5).toFixed(1),
                max: Math.min(7.0, result.level + 0.5).toFixed(1),
              })}
            </Link>
          </>
        )}
      </div>
    );
  }

  const question = questions[step];
  const stepNum = step + 1;

  return (
    <div className="rating-overlay">
      <button type="button" className="rating-back" onClick={onClose}>
        <ChevronIcon aria-hidden="true" />
      </button>

      <div className="rating-progress">
        {questions.map((q, i) => (
          <span key={q.key} className={`rating-progress-seg${i < step ? " done" : ""}`} />
        ))}
      </div>
      <div className="rating-step-label">{t("שלב {n} מתוך {total}", { n: stepNum, total: questions.length })}</div>
      <div className="rating-join-line">
        {t("מצטרפ/ת ל-{league} · {sport}", { league: league.name, sport: t(sportName) })}
      </div>

      <h1 className="rating-question">{t(question.title, { sport: t(sportName) })}</h1>

      {error && <p className="error">{t(error)}</p>}

      <div className="rating-options">
        {question.options.map((opt, i) => {
          const selected = answers[question.key] === i;
          const desc = optionDesc(opt);
          return (
            <button
              type="button"
              key={i}
              className={`rating-option${selected ? " selected" : ""}`}
              onClick={() => selectAnswer(question.key, i)}
              disabled={submitting}
            >
              <span className="rating-option-text">
                <span className="rating-option-label">{t(optionLabel(opt))}</span>
                {desc && <span className="rating-option-desc">{t(desc)}</span>}
              </span>
              <span className="rating-option-dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {question.key === "q3" && (
        <p className="rating-branch-note muted">
          {t("בחירה באפשרות האחרונה מחליפה את השאלות הבאות בשאלה אחת על הרקע התחרותי שלך.")}
        </p>
      )}
    </div>
  );
}

function bandSentence(band) {
  switch (band) {
    case "New player":
      return "את/ה בתחילת הדרך ב{sport} — הליגה הזו בנויה בדיוק בשביל זה.";
    case "Beginner":
      return "את/ה מכיר/ה את הבסיס ובונה עקביות.";
    case "Intermediate":
      return "יש לך שליטה טובה בחילופים ואת/ה מתחיל/ה לכוון את הנקודות.";
    case "Advanced":
      return "המשחק שלך יציב ותחרותי, עם הגשה ומכות שמפעילות לחץ.";
    case "Competitive":
      return "יש לך רקע תחרותי רציני, והמשחק שלך משקף את זה.";
    case "Professional":
      return "שיחקת ברמה המקצועית ביותר — הליגות כאן בנויות בהתאם.";
    default:
      return "רמת המשחק שלך גבוהה ותחרותית ברמה הגבוהה ביותר.";
  }
}
