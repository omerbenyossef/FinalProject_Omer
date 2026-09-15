import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { SettingsIcon, ChevronIcon } from "../Icons.jsx";
import { monthName } from "../matchUtils.js";
import PhotoPicker from "../PhotoPicker.jsx";

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
  const played = me?.matches_played ?? stats?.matches_played ?? 0;
  const toGo = Math.max(0, (rankings?.min_matches ?? 5) - played);
  const standingLine = (() => {
    if (level == null) return t("עוד לא נקבעה רמה");
    // A level from the questionnaire alone isn't a standing yet: the table
    // asks for five matches first (the same threshold it ranks records by).
    if (toGo > 0)
      return `${t("לא מדורג")} · ${
        toGo === 1 ? t("עוד משחק אחד") : t("עוד {n} משחקים", { n: toGo })
      }`;
    if (me?.rank)
      return t("{rank} מתוך {total} שחקנים", { rank: me.rank, total: rankings.total });
    return t("{n} שחקנים", { n: rankings?.total ?? 0 });
  })();
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

      <PhotoPicker />

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

      {/* ranks-entry-173: the NTRP card is the way into the rankings — "what
          does this number mean" and "where am I against everyone" are the same
          question. It spans the grid and is the only tappable cell. */}
      <div className="mp-grid">
        <button
          type="button"
          className="mp-cell mp-cell--ntrp"
          onClick={() => navigate(level != null ? "/ranks" : "/settings")}
        >
          <span className="mp-ntrp-num">
            <span className={`mp-num${level != null ? " lime" : " dim"}`}>
              <span dir="ltr">{level != null ? level.toFixed(1) : "—"}</span>
            </span>
            <span className="mp-label">{"NTRP"}</span>
          </span>
          <span className="mp-ntrp-text">
            <span className="mp-ntrp-title">
              {level != null ? t("איפה אני מול כולם") : t("קבע את הרמה שלך")}
            </span>
            <span className="mp-ntrp-sub">{standingLine}</span>
          </span>
          <ChevronIcon className="mp-ntrp-chev" aria-hidden="true" />
        </button>
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
