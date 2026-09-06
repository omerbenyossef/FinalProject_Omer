import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon, CheckIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { roundDueDateObj, hasHebrewChars, daysWord } from "../matchUtils.js";

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function buildDayOptions(roundEndDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 5;
  if (roundEndDate) {
    const end = new Date(roundEndDate);
    end.setHours(0, 0, 0, 0);
    const daysLeft = Math.floor((end - today) / 86400000) + 1;
    count = Math.max(1, Math.min(5, daysLeft));
  }
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function buildTimeSlots() {
  const slots = [];
  for (let h = 7; h <= 22; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 22) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

const TIME_SLOTS = buildTimeSlots();

export default function ProposeSchedule() {
  const { matchId } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [court, setCourt] = useState("");
  const [editingCourt, setEditingCourt] = useState(false);

  useEffect(() => {
    api
      .getMatchDetail(matchId)
      .then((data) => {
        setDetail(data);
        setCourt(data.default_court || "");
      })
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
          <span className="sched-nav-label">{t("SCHEDULE")}</span>
        </div>
        <SkeletonBar width={200} height={32} style={{ marginTop: 18 }} />
      </div>
    );
  }

  const roundEnd = detail.round_number
    ? roundDueDateObj(detail.schedule_started_at, detail.round_number, detail.round_length_days || 7)
    : null;
  const days = buildDayOptions(roundEnd);

  async function handleSend() {
    if (!selectedDay || !selectedTime) return;
    setBusy(true);
    setError("");
    try {
      const [h, m] = selectedTime.split(":").map(Number);
      const dt = new Date(selectedDay);
      dt.setHours(h, m, 0, 0);
      await api.proposeMatchSchedule(matchId, dt.toISOString(), court.trim() || null);
      navigate(-1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("SCHEDULE")}</span>
      </div>

      <h1 className="sched-title">{t("מול {name}", { name: detail.opponent.name })}</h1>
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
            {roundEnd &&
              (() => {
                const n = Math.max(0, Math.ceil((roundEnd.getTime() - Date.now()) / 86400000));
                return ` · ENDS IN ${n} ${daysWord(n)}`;
              })()}
          </>
        ) : (
          "FRIENDLY"
        )}
      </p>

      {error && <p className="error">{t(error)}</p>}

      <div className="sched-section-label">{t("DAY")}</div>
      <div className="sched-days">
        {days.map((d) => {
          const isSelected = selectedDay && d.getTime() === selectedDay.getTime();
          return (
            <button
              type="button"
              key={d.getTime()}
              className={`sched-day${isSelected ? " on" : ""}`}
              onClick={() => setSelectedDay(d)}
            >
              <span className="sched-day-weekday">{WEEKDAY_SHORT[d.getDay()]}</span>
              <span className="sched-day-date">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="sched-section-label">{t("TIME")}</div>
      <div className="sched-times">
        {TIME_SLOTS.map((slot) => {
          const isSelected = selectedTime === slot;
          return (
            <button
              type="button"
              key={slot}
              className={`sched-time-row${isSelected ? " on" : ""}`}
              onClick={() => setSelectedTime(slot)}
            >
              <span dir="ltr">{slot}</span>
              {isSelected && <CheckIcon aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="sched-section-label">{t("COURT")}</div>
      <div className="sched-court-row">
        {editingCourt ? (
          <input
            type="text"
            className="sched-court-input"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            onBlur={() => setEditingCourt(false)}
            autoFocus
          />
        ) : (
          <span className="sched-court-value">{court || t("טרם נקבעה")}</span>
        )}
        <button type="button" className="sched-court-edit" onClick={() => setEditingCourt((v) => !v)}>
          EDIT
        </button>
      </div>

      <div className="sched-bottom">
        <button
          type="button"
          className="sched-send"
          disabled={!selectedDay || !selectedTime || busy}
          onClick={handleSend}
        >
          {t("שלח הצעה ל{name}", { name: detail.opponent.name })}
        </button>
        <p className="sched-pending">{t("HE CONFIRMS · THEN IT IS SET")}</p>
      </div>
    </div>
  );
}
