import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon, PlusIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { SportIcon } from "../SportSwitcher.jsx";
import OpenGameRow from "./OpenGameRow.jsx";

/* 194a — the full open-games screen.
   Two labelled groups instead of one list: the games I am already in, and the
   ones I could take. Mixing them meant a card with a "join" button sat next
   to one that had nothing to offer, and nothing said which was which.

   Opening a game is its own screen (OpenGameNew). */

export default function OpenGames() {
  const { selectedSportId, selectedSport } = useSport();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [games, setGames] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  // A seat given up and a game called off are both things somebody else is
  // waiting on, so neither happens on one tap.
  const [confirming, setConfirming] = useState(null);

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

  async function doLeave(game) {
    setConfirming(null);
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

  async function doCancel(game) {
    setConfirming(null);
    setBusyId(game.id);
    try {
      await api.cancelOpenGame(game.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function share(game) {
    const url = `${window.location.origin}/games/open`;
    const text = t("יש לי אירוע ב{where} — מצטרף/ת?", { where: game.where || t("מגרש") });
    try {
      if (navigator.share) {
        await navigator.share({ text: `${text}\n${url}` });
      } else {
        await navigator.clipboard?.writeText(`${text}\n${url}`);
      }
    } catch {
      // The share sheet being dismissed is not an error worth a message.
    }
  }

  const all = games || [];
  const myGames = all.filter((g) => g.mine || g.joined);
  // Soonest first, and the ones I could actually take — a game I am in is in
  // the group above, and one out of my range or already full is not an offer.
  const joinable = all
    .filter((g) => !g.mine && !g.joined && !g.blocked_reason)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const blocked = all.filter((g) => !g.mine && !g.joined && g.blocked_reason);

  return (
    <div className="og">
      <div className="lgp-top">
        <Link to="/games" className="lgp-back">
          <ChevronIcon aria-hidden="true" />
          {t("משחקים")}
        </Link>
        {selectedSport && (
          <span className="lgp-sport">
            <SportIcon sport={selectedSport} aria-hidden="true" />
            {t(selectedSport.name)}
          </span>
        )}
      </div>

      <header className="og-head">
        <div className="og-head-text">
          <h1 className="og-title">{t("אירועים")}</h1>
          <p className="og-sub">{t("שחקנים ברמה שלך שמחפשים יריב")}</p>
        </div>
        <Link to="/games/open/new" className="og-new">
          <PlusIcon aria-hidden="true" />
          {t("צור אירוע")}
        </Link>
      </header>

      {error && <p className="og-error error">{t(error)}</p>}

      {games == null ? (
        <SkeletonBar />
      ) : (
        <>
          {myGames.length > 0 && (
            <section className="og-section">
              <h2 className="og-section-title">{t("האירועים שלי")}</h2>
              <div className="ogc-list">
                {myGames.map((game) => (
                  <OpenGameRow
                    key={game.id}
                    game={game}
                    busy={busyId === game.id}
                    onLeave={() => setConfirming({ kind: "leave", game })}
                    onCancel={() => setConfirming({ kind: "cancel", game })}
                    onShare={() => share(game)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="og-section">
            <h2 className="og-section-title">{t("אפשר להצטרף")}</h2>
            {joinable.length === 0 ? (
              <div className="og-empty">
                <p className="gh-preview-empty">{t("אין כרגע אירועים ברמה שלך")}</p>
                <Link to="/games/open/new" className="btn-secondary btn-small">
                  {t("צור אירוע")}
                </Link>
              </div>
            ) : (
              <div className="ogc-list">
                {joinable.map((game) => (
                  <OpenGameRow
                    key={game.id}
                    game={game}
                    busy={busyId === game.id}
                    onJoin={() => join(game)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Out of range, or full while I was looking. Shown with the reason
              on them rather than filtered away, the same rule the leagues
              follow. */}
          {blocked.length > 0 && (
            <section className="og-section">
              <h2 className="og-section-title">{t("לא פתוחים בשבילך")}</h2>
              <div className="ogc-list">
                {blocked.map((game) => (
                  <OpenGameRow key={game.id} game={game} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {confirming && (
        <div className="sheet-backdrop" onClick={() => setConfirming(null)}>
          <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="confirm-sheet-handle" aria-hidden="true" />
            <div className="confirm-sheet-title">
              {confirming.kind === "leave" ? t("לצאת מהאירוע?") : t("לבטל את האירוע?")}
            </div>
            <p className="add-round-subtitle">
              {confirming.kind === "leave"
                ? t("המקום שלך ייפתח מחדש לשחקנים אחרים.")
                : t("מי שכבר הצטרף יקבל הודעה שהאירוע בוטל.")}
            </p>
            <div className="add-round-actions">
              <button
                type="button"
                className="confirm-sheet-btn-confirm"
                onClick={() =>
                  confirming.kind === "leave" ? doLeave(confirming.game) : doCancel(confirming.game)
                }
              >
                {confirming.kind === "leave" ? t("לצאת") : t("לבטל אירוע")}
              </button>
              <button type="button" className="btn-quiet" onClick={() => setConfirming(null)}>
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
