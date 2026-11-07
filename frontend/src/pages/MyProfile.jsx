import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon, CloseIcon, SettingsIcon, TwoPeopleIcon } from "../Icons.jsx";
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

/* 202a — my own profile: who I am, where I stand, three numbers, and the
   three places to go from here. Same content as before; what changed is
   which of it the eye lands on first.

   The photo controls are gone from this page: editing lives behind "edit
   profile", in Settings, where the name and the area already are. */

// One segment per player is the design, and it is the right picture at 16.
// At 300 it is three hundred hairlines, so the bar is capped and my own
// position mapped onto it — the shape (how far along I am) survives.
const MAX_SEGMENTS = 40;

function RankBar({ rank, total }) {
  const count = Math.min(total, MAX_SEGMENTS);
  const mine = Math.max(
    0,
    Math.min(count - 1, Math.round(((rank - 1) / Math.max(1, total - 1)) * (count - 1)))
  );
  return (
    <div className="pf-bar" dir="ltr" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`pf-seg${i === mine ? " is-me" : i < mine ? " is-above" : ""}`}
        />
      ))}
    </div>
  );
}

export default function MyProfile() {
  const { user, logout } = useAuth();
  const { selectedSportId, sports } = useSport();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [leagues, setLeagues] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [rankings, setRankings] = useState(null);
  const [stats, setStats] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    api.myLeagues().then(setLeagues).catch(() => setLeagues([]));
    api.myRatings().then(setRatings).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSportId) return;
    api.rankings(selectedSportId, "ntrp", null, 1).then(setRankings).catch(() => {});
    api.myStats(selectedSportId).then(setStats).catch(() => {});
  }, [selectedSportId]);

  const sportName = sports.find((s) => s.id === selectedSportId)?.name;
  const sportLeagues = (leagues ?? []).filter((l) => l.sport.id === selectedSportId);
  const level = ratings.find((r) => r.sport_id === selectedSportId)?.level ?? null;
  const me = rankings?.me ?? null;
  const wins = me?.wins ?? stats?.wins ?? 0;
  const losses = me?.losses ?? stats?.losses ?? 0;
  const streak = streakOf(stats?.recent_matches);
  const played = me?.matches_played ?? stats?.matches_played ?? 0;
  const winRate = played ? Math.round((wins / played) * 100) : null;
  const toGo = Math.max(0, (rankings?.min_matches ?? 5) - played);
  const ranked = level != null && toGo === 0 && !!me?.rank;

  const standingLine = (() => {
    if (level == null) return t("עוד לא נקבעה רמה");
    // A level from the questionnaire alone isn't a standing yet: the table
    // asks for five matches first (the same threshold it ranks records by).
    if (toGo > 0)
      return toGo === 1 ? t("עוד משחק אחד לדירוג") : t("עוד {n} משחקים לדירוג", { n: toGo });
    if (me?.rank)
      // Short on purpose: beside a 48px number and the pill, "20 of 28
      // players" is three lines or an ellipsis. The bar underneath says
      // "players" better than the word does.
      return t("{rank} מתוך {total}", { rank: me.rank, total: rankings.total });
    return t("{n} שחקנים", { n: rankings?.total ?? 0 });
  })();

  const joined = user?.created_at ? new Date(user.created_at) : null;

  function handleLogout() {
    logout();
    navigate("/signin", { replace: true });
  }

  return (
    <div className="pf">
      <header className="pf-hero">
        <span className="pf-face">
          {user?.photo_url ? (
            <img src={mediaUrl(user.photo_url)} alt="" />
          ) : (
            (user?.name || "?").trim()[0]
          )}
        </span>
        <h1 className="pf-name">{user?.name}</h1>
        {/* Mono with letter-spacing is for Latin only: tracking pulls a
            Hebrew word apart letter by letter. */}
        <p className={`pf-meta${language === "en" ? " is-latin" : ""}`}>
          {sportLeagues.length === 1 ? t("ליגה אחת") : t("{n} ליגות", { n: sportLeagues.length })}
          {joined &&
            ` · ${t("הצטרף ב-{month} {year}", {
              month: monthName(joined, t),
              year: joined.getFullYear(),
            })}`}
        </p>
        {/* The editor lives in Settings, where the name and the area already
            are; this is the way into it, including for the photo. */}
        <Link to="/settings?edit=1" className="pf-edit">
          {t("עריכת פרופיל")}
        </Link>
      </header>

      {/* ranks-entry-173: the NTRP card is the way into the rankings — "what
          does this number mean" and "where am I against everyone" are the
          same question, so the card asks it and answers it. */}
      <section className="pf-ntrp">
        <span className="pf-ntrp-glow" aria-hidden="true" />
        <div className="pf-ntrp-top">
          <div className="pf-ntrp-left">
            <span className="pf-ntrp-num" dir="ltr">
              {level != null ? level.toFixed(1) : "—"}
            </span>
            <span className="pf-ntrp-text">
              <span className="pf-ntrp-label">
                {`NTRP · ${sportName ? t(sportName) : ""}`.trim()}
              </span>
              <span className="pf-ntrp-standing">{standingLine}</span>
            </span>
          </div>
          <button
            type="button"
            className="pf-ntrp-pill"
            onClick={() => navigate(level != null ? "/ranks" : "/settings")}
          >
            {level != null ? t("איפה אני מול כולם") : t("קבע את הרמה שלך")}
            <ChevronIcon aria-hidden="true" />
          </button>
        </div>

        {ranked && (
          <>
            <RankBar rank={me.rank} total={rankings.total} />
            <div className="pf-bar-ends" dir="ltr">
              <span>#1</span>
              <span>{`#${rankings.total}`}</span>
            </div>
          </>
        )}
      </section>

      <div className="pf-tiles">
        <div className="pf-tile">
          <span className="pf-tile-num" dir="ltr">{`${wins}–${losses}`}</span>
          <span className="pf-tile-label">{t("מאזן")}</span>
        </div>
        <div className="pf-tile">
          {/* The count is the number; which way it runs is the label. A
              single W/L letter glued to a digit is where bidi breaks. */}
          <span className={`pf-tile-num${streak?.won ? " is-accent" : ""}`} dir="ltr">
            {streak ? streak.n : "—"}
          </span>
          <span className="pf-tile-label">
            {streak ? (streak.won ? t("רצף ניצחונות") : t("רצף הפסדים")) : t("רצף")}
          </span>
        </div>
        <div className="pf-tile">
          <span className="pf-tile-num" dir="ltr">
            {winRate == null ? "—" : `${winRate}%`}
          </span>
          <span className="pf-tile-label">{t("אחוז ניצחונות")}</span>
        </div>
      </div>

      <div className="pf-list">
        {user?.is_admin && (
          <Link to="/admin" className="pf-row">
            <span className="pf-row-icon is-filled" aria-hidden="true">
              <TwoPeopleIcon />
            </span>
            <span className="pf-row-body">
              <span className="pf-row-title">{t("ניהול")}</span>
              <span className="pf-row-sub">{t("כל השחקנים · כל הליגות")}</span>
            </span>
            <ChevronIcon className="pf-row-chev" aria-hidden="true" />
          </Link>
        )}

        <Link to="/settings" className="pf-row">
          <span className="pf-row-icon" aria-hidden="true">
            <SettingsIcon />
          </span>
          <span className="pf-row-body">
            <span className="pf-row-title">{t("הגדרות")}</span>
            <span className="pf-row-sub">{t("התראות · זמינות · שפה")}</span>
          </span>
          <ChevronIcon className="pf-row-chev" aria-hidden="true" />
        </Link>

        <button type="button" className="pf-row is-danger" onClick={() => setLoggingOut(true)}>
          <span className="pf-row-icon" aria-hidden="true">
            <CloseIcon />
          </span>
          <span className="pf-row-body">
            <span className="pf-row-title">{t("התנתקות")}</span>
          </span>
        </button>
      </div>

      {loggingOut && (
        <div className="confirm-sheet-overlay" onClick={() => setLoggingOut(false)}>
          <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-sheet-handle" />
            <div className="confirm-sheet-title">{t("להתנתק?")}</div>
            <p className="add-round-subtitle">{t("תצטרכו להתחבר שוב כדי לחזור.")}</p>
            <div className="add-round-actions">
              <button
                type="button"
                className="confirm-sheet-btn-confirm confirm-sheet-btn-danger"
                onClick={handleLogout}
              >
                {t("התנתקות")}
              </button>
              <button
                type="button"
                className="link-btn add-round-cancel"
                onClick={() => setLoggingOut(false)}
              >
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
