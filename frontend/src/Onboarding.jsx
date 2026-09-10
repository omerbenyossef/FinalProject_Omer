import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import { useSport } from "./SportContext.jsx";
import { api } from "./api";
import RatingQuestionnaire from "./RatingQuestionnaire.jsx";
import { PersonIcon, TrophyIcon, RanksIcon } from "./Icons.jsx";
import { hasSeenIntro, markIntroSeen } from "./onboardingSeen.js";

const STEP_COUNT = 3;

// The three sketches on screen 2. Symmetric on purpose — nothing here needs
// flipping between RTL and LTR.
function PublicLeagueArt() {
  return (
    <svg width="62" height="40" viewBox="0 0 62 40" aria-hidden="true">
      {[0, 1].map((row) =>
        [0, 1, 2, 3].map((col) => (
          <circle
            key={`${row}-${col}`}
            cx={11 + col * 13}
            cy={14 + row * 12}
            r="3.5"
            fill={row === 0 && col === 0 ? "#c6f24e" : "#3a424e"}
          />
        ))
      )}
    </svg>
  );
}

function PrivateLeagueArt() {
  return (
    <svg width="62" height="40" viewBox="0 0 62 40" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={9 + i * 12} cy="20" r="3.5" fill="#3a424e" />
      ))}
      <rect
        x="40"
        y="10"
        width="20"
        height="20"
        rx="5"
        fill="none"
        stroke="#8b93a6"
        strokeWidth="1.4"
        strokeDasharray="3 3"
      />
      <path d="M50 15v10M45 20h10" stroke="#8b93a6" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function FriendlyArt() {
  return (
    <svg width="62" height="40" viewBox="0 0 62 40" aria-hidden="true">
      <circle cx="13" cy="20" r="4.5" fill="#8b93a6" />
      <path d="M22 20h18" stroke="#3a424e" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="49" cy="20" r="4.5" fill="#8b93a6" />
    </svg>
  );
}

// "Rally" and the NTRP numbers always read left to right, isolated from the
// surrounding Hebrew so a maqaf or a comma can't land on the wrong side.
function withBrand(text) {
  return text
    .split(/(Rally)/)
    .map((part, i) =>
      part === "Rally" ? (
        <span key={i} className="ob-name">
          Rally
        </span>
      ) : (
        part
      )
    );
}

function withNumbers(template, values) {
  return template.split(/(\{min\}|\{max\})/).map((part, i) => {
    const key = part === "{min}" ? "min" : part === "{max}" ? "max" : null;
    if (!key) return part;
    return (
      <span key={i} className="ob-num">
        {values[key]}
      </span>
    );
  });
}

function Row({ art, icon, iconActive, title, quiet, desc }) {
  return (
    <div className="ob-row">
      {art ? (
        <div className="ob-row-art">{art}</div>
      ) : (
        <div className={`ob-row-icon${iconActive ? " active" : ""}`}>{icon}</div>
      )}
      <div>
        <div className={`ob-row-title${quiet ? " quiet" : ""}`}>{title}</div>
        <div className="ob-row-desc">{desc}</div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { t } = useLanguage();
  const { sports, selectedSportId } = useSport();
  const [dismissed, setDismissed] = useState(hasSeenIntro());
  const [step, setStep] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(null);

  // Whether to hand off to the questionnaire at the end: a player who somehow
  // already has a level for this sport would only hit "you already have a
  // rating" there, so for them the last button just closes.
  useEffect(() => {
    if (dismissed || !selectedSportId) return;
    api
      .myRatings()
      .then((ratings) => setAlreadyRated(ratings.some((r) => r.sport_id === selectedSportId)))
      .catch(() => setAlreadyRated(true));
  }, [dismissed, selectedSportId]);

  if (dismissed) return null;

  const sportName = sports.find((s) => s.id === selectedSportId)?.name;

  // The seen flag is written when the whole sequence is over, questionnaire
  // included — PageHelp waits on that same flag before popping its own
  // explanation, and it shouldn't land on top of the questionnaire.
  function close() {
    markIntroSeen();
    setDismissed(true);
  }

  function next() {
    if (step < STEP_COUNT - 1) {
      setStep((s) => s + 1);
      return;
    }
    if (selectedSportId && alreadyRated === false) {
      setShowRating(true);
      return;
    }
    close();
  }

  if (showRating) {
    return (
      <RatingQuestionnaire
        initial
        sportId={selectedSportId}
        sportName={sportName}
        onClose={close}
      />
    );
  }

  return (
    <div className="ob">
      <div className="ob-top">
        <div className="ob-brand">
          <span className="ob-wordmark">RALLY</span>
          <span className="ob-dot" aria-hidden="true" />
        </div>
        <button type="button" className="ob-skip" onClick={close}>
          {t("דלג")}
        </button>
      </div>

      {step === 0 && (
        <>
          <h1 className="ob-title ob-title--lg">{withBrand(t("ברוך הבא ל־Rally"))}</h1>

          <div className="ob-body">
            <p className="ob-lead">{t("תחרות אמיתית, נגישה לכולם")}</p>
            <p>
              {withBrand(
                t(
                  "Rally הופך את המשחקים שאתה כבר משחק לליגה. אתה מצטרף לקבוצה של שחקנים ברמה שלך, מקבל יריב חדש בכל מחזור, ומדווח את התוצאה בסוף. היריב מאשר, והטבלה זזה."
                )
              )}
            </p>
            <p>
              {withBrand(t("אין שופטים, אין מגרש קבוע ואין מנוי. אתה קובע מתי ואיפה, Rally סופר."))}
            </p>
            <p>
              {t(
                "עונה נמשכת כמה מחזורים. בסופה יש מנצח אחד, ולכל שחקן דירוג שאומר איפה הוא עומד מול השאר."
              )}
            </p>
          </div>

          <div className="ob-note">
            <div className="ob-note-head">
              <span className="ob-note-tag">NTRP</span>
              <span className="ob-note-title">{t("הרמה שלך, במספר אחד")}</span>
            </div>
            <p>
              {withNumbers(
                t(
                  "סולם טניס מקובל מ־{min} עד {max} בקפיצות של חצי, וכל ליגה משחקת בטווח מסוים. בהתחלה תענה על שאלון קצר על המשחק שלך, וממנו נגזרת הרמה שלך. היא זמנית לשלושה משחקים, ואז מתעדכנת לפי התוצאות."
                ),
                { min: "1.0", max: "7.0" }
              )}
            </p>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="ob-title">{t("שלוש דרכים לשחק")}</h1>
          <p className="ob-lede">{t("אחרי השאלון תבחר איך להתחיל. אפשר לשנות בכל שלב.")}</p>

          <div className="ob-rows">
            <Row
              art={<PublicLeagueArt />}
              title={t("הצטרף לליגה ציבורית")}
              desc={t("שחקנים מהאזור שלך בטווח הרמה שלך. בלי הזמנה.")}
            />
            <Row
              art={<PrivateLeagueArt />}
              title={t("פתח ליגה פרטית")}
              desc={t("אתה מזמין את החברים וקובע את החוקים.")}
            />
            <Row
              art={<FriendlyArt />}
              title={t("שחק משחק חברי")}
              quiet
              desc={t("משחק בודד מול מי שתרצה, בלי ליגה ובלי טבלה.")}
            />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="ob-title">{t("שלושה מסכים באפליקציה")}</h1>
          <p className="ob-lede">{t("הכל נמצא בשורת הניווט התחתונה.")}</p>

          <div className="ob-rows">
            <Row
              icon={<PersonIcon aria-hidden="true" />}
              iconActive
              title={t("פרופיל")}
              desc={t(
                "המסך שנפתח ראשון: המשחק הקרוב שלך, תוצאות שממתינות לאישור, והליגות שאתה משחק בהן."
              )}
            />
            <Row
              icon={<TrophyIcon aria-hidden="true" />}
              title={t("ליגות")}
              desc={t("הליגות שלך, וליגות פתוחות להצטרפות ברמה שלך.")}
            />
            <Row
              icon={<RanksIcon aria-hidden="true" />}
              title={t("דירוג")}
              desc={t("כל השחקנים לפי רמה, גם מחוץ לליגה שלך.")}
            />
          </div>
        </>
      )}

      <div className="ob-foot">
        <div className="ob-steps">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span key={i} className={`ob-step${i === step ? " active" : ""}`} />
          ))}
        </div>
        <button type="button" className="ob-next" onClick={next}>
          {step === STEP_COUNT - 1 ? t("בוא נתחיל") : t("המשך")}
        </button>
      </div>
    </div>
  );
}
