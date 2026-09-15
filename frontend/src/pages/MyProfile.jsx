import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { SettingsIcon, ChevronIcon } from "../Icons.jsx";
import { monthName } from "../matchUtils.js";

// The streak is the run of same-result matches at the top of the history.
function streakOf(recent) {
  if (!recent || recent.length === 0) return null;
  const won = recent[0].won;
  let n = 0;
  for (const match of recent) {
    if (match.won !== won) break;
    n += 1;
  }
  return { won, n };
}

// my-profile-171a — my own profile: who I am, four numbers, settings, log out.
// No league list (that's the LEAGUES tab), no history (MATCHES), no NTRP scale
// (the home screen).
export default function MyProfile() {
  const { user, logout } = useAuth();
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [leagues, setLeagues] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [rankings, setRankings] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.myLeagues().then(setLeagues).catch(() => setLeagues([]));
    api.myRatings().then(setRatings).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSportId) return;
    api.rankings(selectedSportId, "ntrp", null, 1).then(setRankings).catch(() => {});
    api.myStats(selectedSportId).then(setStats).catch(() => {});
  }, [selectedSportId]);

  const sportLeagues = (leagues ?? []).filter((l) => l.sport.id === selectedSportId);
  const level = ratings.find((r) => r.sport_id === selectedSportId)?.level ?? null;
  const me = rankings?.me ?? null;
  const wins = me?.wins ?? stats?.wins ?? 0;
  const losses = me?.losses ?? stats?.losses ?? 0;
  const streak = streakOf(stats?.recent_matches);
  const joined = user?.created_at ? new Date(user.created_at) : null;

  function handleLogout() {
    logout();
    navigate("/signin", { replace: true });
  }

  return (
    <div className="mp">
      <div className="mp-head">
        <span className="mp-head-label">{t("פרופיל")}</span>
        <Link to="/settings" className="mp-head-edit">
          {t("עריכה")}
        </Link>
      </div>

      <div className="mp-id">
        <h1 className="mp-name">{user?.name}</h1>
        <span className="mp-sub">
          {sportLeagues.length === 1 ? t("ליגה אחת") : t("{n} ליגות", { n: sportLeagues.length })}
          {joined &&
            ` · ${t("הצטרף ב-{month} {year}", {
              month: monthName(joined, t),
              year: joined.getFullYear(),
            })}`}
        </span>
      </div>

      <div className="mp-grid">
        <div className="mp-cell">
          <span className="mp-num lime">
            <span dir="ltr">{level != null ? level.toFixed(1) : "—"}</span>
          </span>
          <span className="mp-label">{"NTRP"}</span>
        </div>
        <div className="mp-cell">
          {me?.rank ? (
            <>
              <span className="mp-num">
                <span dir="ltr">{me.rank}</span>
              </span>
              <span className="mp-label">{t("דירוג מתוך {n}", { n: rankings.total })}</span>
            </>
          ) : (
            <>
              <span className="mp-num dim">
                <span dir="ltr">—</span>
              </span>
              <span className="mp-label">{t("ללא דירוג")}</span>
            </>
          )}
        </div>
        <div className="mp-cell">
          <span className="mp-num">
            <span dir="ltr">
              {wins}-{losses}
            </span>
          </span>
          <span className="mp-label">{t("מאזן")}</span>
        </div>
        <div className="mp-cell">
          {/* The count is the number; which way it runs is the label. A
              single W/L letter glued to a digit is exactly where bidi breaks. */}
          <span className={`mp-num${streak ? (streak.won ? "" : " dim") : " dim"}`}>
            <span dir="ltr">{streak ? streak.n : "—"}</span>
          </span>
          <span className="mp-label">
            {streak ? (streak.won ? t("רצף ניצחונות") : t("רצף הפסדים")) : t("רצף")}
          </span>
        </div>
      </div>

      <Link to="/settings" className="mp-settings">
        <SettingsIcon className="mp-settings-icon" aria-hidden="true" />
        <span className="mp-settings-text">
          <span className="mp-settings-title">{t("הגדרות")}</span>
          <span className="mp-settings-sub">{t("התראות · זמינות · שפה")}</span>
        </span>
        <ChevronIcon className="mp-settings-chev" aria-hidden="true" />
      </Link>

      <button type="button" className="mp-logout" onClick={handleLogout}>
        {t("התנתקות")}
      </button>
    </div>
  );
}
