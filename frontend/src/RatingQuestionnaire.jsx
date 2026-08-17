import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useLanguage } from "./LanguageContext.jsx";
import { ChevronIcon } from "./Icons.jsx";

const QUESTIONS = [
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
    options: ["אף פעם, רק משחקים חברתיים", "משחקי מועדון או מקומיים", "טורנירים אזוריים או מדורגים", "רמה ארצית"],
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
];

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

  async function selectAnswer(qKey, index) {
    const next = { ...answers, [qKey]: index };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await api.submitRating(league.id, next);
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
          {[1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5].map((step_) => (
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
                max: Math.min(5.5, result.level + 0.5).toFixed(1),
              })}
            </Link>
          </>
        )}
      </div>
    );
  }

  const question = QUESTIONS[step];
  const stepNum = step + 1;

  return (
    <div className="rating-overlay">
      <button type="button" className="rating-back" onClick={onClose}>
        <ChevronIcon aria-hidden="true" />
      </button>

      <div className="rating-progress">
        {QUESTIONS.map((q, i) => (
          <span key={q.key} className={`rating-progress-seg${i < step ? " done" : ""}`} />
        ))}
      </div>
      <div className="rating-step-label">{t("שלב {n} מתוך 5", { n: stepNum })}</div>
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
    default:
      return "רמת המשחק שלך גבוהה ותחרותית ברמה הגבוהה ביותר.";
  }
}
