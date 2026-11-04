import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon, PlusIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import OpenGameRow from "./OpenGameRow.jsx";

/* 189b — the full list of open games.
   The handoff leaves this screen undesigned and says to use the preview row
   until it is, so that is exactly what it does: the same row, grouped the way
   the leagues list is — what you can join, then what you cannot, with the
   reason on it rather than hidden.

   Opening one is its own screen (OpenGameNew): the handoff never said how a
   player opens a game, and a game has the same questions to answer as a match
   being scheduled — where, how long, when — so it is asked the same way. */

export default function OpenGames() {
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [games, setGames] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!selectedSportId) return;
    try {
      setGames(await api.openGames(selectedSportId));
    } catch {
      setGames([]);
    }
  }, [selectedSportId]);

  useEffect(() => {
    load();
  }, [load]);

  async function join(game) {
    setBusyId(game.id);
    setError("");
    try {
      const after = await api.joinOpenGame(game.id);
      // The last seat turns the game into a match, and the game leaves this
      // list — so the player lands on the match rather than on a row that
      // disappeared.
      if (after?.match_id) {
        navigate(`/matches/${after.match_id}`);
        return;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function leave(game) {
    setBusyId(game.id);
    try {
      await api.leaveOpenGame(game.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      await load();
    }
  }

  const open = games || [];
  const joinable = open.filter((g) => !g.blocked_reason);
  const blocked = open.filter((g) => g.blocked_reason);

  return (
    <div className="og">
      <header className="og-head">
        <Link to="/games" className="back-link">
          <ChevronIcon aria-hidden="true" />
          {t("משחקים")}
        </Link>
        <h1 className="og-title">{t("משחקים פתוחים")}</h1>
        <p className="og-sub">{t("משחקים שמישהו פתח ואפשר להצטרף אליהם")}</p>
      </header>

      <Link to="/games/open/new" className="og-open-btn">
        <PlusIcon aria-hidden="true" />
        {t("פתח משחק")}
      </Link>

      {error && <p className="og-error error">{t(error)}</p>}

      {games == null ? (
        <SkeletonBar />
      ) : open.length === 0 ? (
        <p className="gh-preview-empty">{t("אין כרגע משחקים פתוחים בענף הזה.")}</p>
      ) : (
        <>
          {joinable.length > 0 && (
            <section className="og-section">
              <h2 className="og-section-title">{t("אפשר להצטרף")}</h2>
              {joinable.map((game) => (
                <div key={game.id}>
                  <OpenGameRow game={game} onJoin={join} busy={busyId === game.id} />
                  {game.joined && (
                    <div className="og-row-actions">
                      <button type="button" className="btn-quiet" onClick={() => leave(game)}>
                        {game.mine ? t("צא מהמשחק") : t("בטל הצטרפות")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
          {blocked.length > 0 && (
            <section className="og-section">
              <h2 className="og-section-title">{t("לא פתוחים בשבילך")}</h2>
              {blocked.map((game) => (
                <OpenGameRow key={game.id} game={game} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
