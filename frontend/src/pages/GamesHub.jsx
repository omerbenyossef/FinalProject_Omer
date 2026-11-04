import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { PlusIcon, TrophyIcon, TwoPeopleIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import OpenGameRow from "./OpenGameRow.jsx";

/* 189b — the Games hub.
   The middle tab used to go straight to the leagues list, which made a league
   the only kind of game the app admitted to having. The hub puts the three
   kinds side by side — leagues, games other people opened, and a friendly —
   and the leagues page moves one level down behind the first of them.

   Deliberately no "waiting for your reply" banner here (189b): pending league
   business belongs on the home screen and in notifications, not on the screen
   you came to in order to start something new. */

const PREVIEW_ROWS = 3;

export default function GamesHub() {
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [leagueCount, setLeagueCount] = useState(null);
  const [games, setGames] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!selectedSportId) return;
    const [leagues, open] = await Promise.all([
      api.myLeagues().catch(() => []),
      api.openGames(selectedSportId).catch(() => []),
    ]);
    setLeagueCount(leagues.filter((l) => l.sport?.id === selectedSportId).length);
    setGames(open);
  }, [selectedSportId]);

  useEffect(() => {
    load();
  }, [load]);

  async function join(game) {
    setBusyId(game.id);
    try {
      const after = await api.joinOpenGame(game.id);
      // Taking the last seat turns the game into a match. It leaves this list
      // at that moment, so without this the row would simply vanish — the
      // player goes to the match instead.
      if (after?.match_id) {
        navigate(`/matches/${after.match_id}`);
        return;
      }
      await load();
    } catch {
      // The row's own reason is the message; a failed join just reloads so the
      // row shows whatever is true now (somebody may have taken the last seat).
      await load();
    } finally {
      setBusyId(null);
    }
  }

  // The preview is the games the viewer could actually take. One that is full
  // or out of range is still worth seeing, but not in the three rows that
  // answer "what can I play".
  const joinable = (games || []).filter((g) => !g.blocked_reason && !g.joined);
  const thisWeek = joinable.filter(
    (g) => new Date(g.starts_at) - Date.now() < 7 * 86400000
  ).length;

  return (
    <div className="gh">
      <header className="gh-head">
        <h1 className="gh-title">{t("משחקים")}</h1>
        <p className="gh-sub">{t("ליגות, משחקים פתוחים ומשחק ידידותי")}</p>
      </header>

      <div className="gh-tiles">
        <Link to="/leagues" className="gh-tile">
          <TrophyIcon className="gh-tile-icon" aria-hidden="true" />
          <span className="gh-tile-body">
            <span className="gh-tile-title">{t("ליגות")}</span>
            <span className="gh-tile-sub">
              {leagueCount == null ? "—" : t("{n} שלך", { n: leagueCount })}
            </span>
          </span>
        </Link>

        <Link to="/games/open" className="gh-tile">
          <TwoPeopleIcon className="gh-tile-icon" aria-hidden="true" />
          <span className="gh-tile-body">
            <span className="gh-tile-title">{t("פתוחים")}</span>
            <span className="gh-tile-sub">
              {games == null ? "—" : t("{n} השבוע", { n: thisWeek })}
            </span>
          </span>
        </Link>

        <button type="button" className="gh-tile gh-tile--primary" onClick={() => navigate("/friendly/new")}>
          <PlusIcon className="gh-tile-icon" aria-hidden="true" />
          <span className="gh-tile-body">
            <span className="gh-tile-title">{t("ידידותי")}</span>
            <span className="gh-tile-sub">{t("משחק חדש")}</span>
          </span>
        </button>
      </div>

      <section className="gh-preview">
        <div className="gh-preview-head">
          <h2 className="gh-preview-title">{t("משחקים פתוחים ברמה שלך")}</h2>
          <Link to="/games/open" className="gh-preview-all">
            {t("הכל")}
          </Link>
        </div>

        {games == null ? (
          <SkeletonBar />
        ) : joinable.length === 0 ? (
          <>
            <p className="gh-preview-empty">{t("אין כרגע משחקים פתוחים ברמה שלך.")}</p>
            {/* An empty list is the moment to offer opening one — see
                firstdayandemptystates109: no content, an action, no
                placeholder. */}
            <Link to="/games/open/new" className="gh-preview-open">
              {t("פתח משחק")}
            </Link>
          </>
        ) : (
          joinable
            .slice(0, PREVIEW_ROWS)
            .map((game) => (
              <OpenGameRow key={game.id} game={game} onJoin={join} busy={busyId === game.id} />
            ))
        )}
      </section>
    </div>
  );
}
