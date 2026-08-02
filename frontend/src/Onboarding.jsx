import { useState } from "react";
import { useLanguage } from "./LanguageContext.jsx";
import { TrophyIcon, CalendarIcon, RankingIcon, BellIcon } from "./Icons.jsx";

const SEEN_KEY = "onboardingSeen";

const STEPS = [
  {
    Icon: TrophyIcon,
    title: "ליגת חברים או ליגה ציבורית",
    text: "צרו ליגה סגורה עם קוד הזמנה לחברים שלכם, או הצטרפו לליגה ציבורית ושחקו נגד יריבים חדשים.",
  },
  {
    Icon: CalendarIcon,
    title: "שחקו ודווחו תוצאות",
    text: "לוח המשחקים נוצר אוטומטית כל שבוע. אתם רק צריכים לשחק ולדווח את התוצאה.",
  },
  {
    Icon: RankingIcon,
    title: "עקבו אחרי הדירוג שלכם",
    text: "כל ניצחון מקדם אתכם בטבלת הדירוג של הליגה.",
  },
  {
    Icon: BellIcon,
    title: "קבלו התראות",
    text: "הפעילו התראות בהגדרות כדי לדעת מיד כשמדווחים תוצאה או נוצר לוח משחקים חדש.",
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
