import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import { TrophyIcon, CalendarIcon, RankingIcon, BellIcon } from "./Icons.jsx";

const SEEN_KEY = "onboardingSeen";

const STEPS = [
  {
    Icon: TrophyIcon,
    title: "בחרו את הזירה שלכם",
    text: "ליגה סודית עם החברים, או ליגה ציבורית עם יריבים חדשים - הבחירה שלכם.",
  },
  {
    Icon: CalendarIcon,
    title: "שחקו. דווחו. תתקדמו.",
    text: "לוח משחקים חדש נוצר לבד כל שבוע - אתם רק צריכים לנצח.",
  },
  {
    Icon: RankingIcon,
    title: "כל ניצחון סופר",
    text: "טפסו בטבלת הדירוג ותראו מי המלך האמיתי של הליגה.",
  },
  {
    Icon: BellIcon,
    title: "אל תפספסו כלום",
    text: "קבלו התראה מיידית על כל תוצאה, ולוח משחקים חדש.",
  },
];

function hasSeenOnboarding() {
  return !!localStorage.getItem(SEEN_KEY);
}

export default function Onboarding() {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(hasSeenOnboarding());
  const [step, setStep] = useState(0);

  if (dismissed) return null;

  function finish() {
    localStorage.setItem(SEEN_KEY, "1");
    setDismissed(true);
  }

  function next() {
    if (step === STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  }

  const { Icon, title, text } = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <button type="button" className="onboarding-skip" onClick={finish}>
          {t("דלג")}
        </button>

        <div className="onboarding-icon">
          <Icon aria-hidden="true" />
        </div>
        <h2 className="onboarding-title">{t(title)}</h2>
        <p className="onboarding-text">{t(text)}</p>

        <div className="onboarding-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`onboarding-dot${i === step ? " active" : ""}`} />
          ))}
        </div>

        <button type="button" className="btn-primary onboarding-next" onClick={next}>
          {isLast ? t("בואו נתחיל") : t("הבא")}
        </button>
      </div>
    </div>
  );
}
