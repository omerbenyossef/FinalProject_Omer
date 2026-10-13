import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { useSport } from "../SportContext.jsx";
import { calendarDaysUntil, dayMonthPadded, weekdayName } from "../matchUtils.js";

/* 183b — the two ways to get a match when the league isn't offering one.
   They used to sit on the home screen itself, under a paragraph explaining
   why it was empty. Here they get the room to be a choice: one screen, one
   question, two answers. */

export default function NewMatch() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { selectedSportId } = useSport();
  const [week, setWeek] = useState(null);

  // The same payload the home screen reads, for the same two numbers: when
  // the next round opens, and how many players are near this level.
  useEffect(() => {
    if (!selectedSportId) return;
    api.homeWeek(selectedSportId).then(setWeek).catch(() => setWeek(null));
  }, [selectedSportId]);

  const nextStart = week?.next_round_starts_at ? new Date(week.next_round_starts_at) : null;
  const days = nextStart ? calendarDaysUntil(nextStart) : null;
  const near = week?.players_near_level ?? 0;
  const level = week?.my_level;

  return (
    <div className="nm">
      <button type="button" className="nm-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="nm-head">
        <h1 className="nm-title">
          {t("משחק חדש")}
        </h1>
        {days !== null && (
          <p className="nm-sub">
            {days === 0
              ? t("המחזור הבא מתחיל היום")
              : days === 1
                ? t("המחזור הבא מתחיל מחר")
                : t("המחזור הבא מתחיל ב-{day} {date}", {
                    day: weekdayName(nextStart, t),
                    date: dayMonthPadded(nextStart),
                  })}
          </p>
        )}
      </div>

      <div className="nm-options">
        <button type="button" className="nm-opt" onClick={() => navigate("/friendly/new")}>
          <span className="nm-opt-text">
            <span className="nm-opt-title">{t("מצא משחק ידידותי")}</span>
            {near > 0 && level != null && (
              <span className="nm-opt-sub">
                {near === 1
                  ? t("שחקן אחד ברמה {level}", { level: level.toFixed(1) })
                  : t("{n} שחקנים ברמה {level}", { n: near, level: level.toFixed(1) })}
              </span>
            )}
          </span>
          <span className="nm-opt-go" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        <button
          type="button"
          className="nm-opt nm-opt--ghost"
          onClick={() => navigate("/leagues/open")}
        >
          <span className="nm-opt-text">
            <span className="nm-opt-title">{t("עיין בליגות פתוחות")}</span>
            <span className="nm-opt-sub">
              {t("הצטרף וקבל משחקים")}
            </span>
          </span>
          <span className="nm-opt-chev" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}
