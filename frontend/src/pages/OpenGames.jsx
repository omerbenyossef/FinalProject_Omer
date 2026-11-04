import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

   The "open a game" form at the top is mine, not the spec's: the spec says
   open games are "games other players opened" and never says how a player
   opens one, so without this the list can only ever be empty. Minimal on
   purpose, to be replaced when that flow is designed. */

function isoLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function OpenGames() {
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const [games, setGames] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [opening, setOpening] = useState(false);
  const [when, setWhen] = useState(() => isoLocal(new Date(Date.now() + 86400000)));
  const [where, setWhere] = useState("");
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
      await api.joinOpenGame(game.id);
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

  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createOpenGame({
        sport_id: selectedSportId,
        // The input is local time; the server stores UTC.
        starts_at: new Date(when).toISOString(),
        court: where.trim() || null,
      });
      setOpening(false);
      setWhere("");
      await load();
    } catch (err) {
      setError(err.message);
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

      {opening ? (
        <form className="og-form" onSubmit={create}>
          <label className="og-field">
            <span>{t("מתי")}</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </label>
          <label className="og-field">
            <span>{t("איפה")}</span>
            <input
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder={t("שם המגרש")}
              maxLength={120}
            />
          </label>
          <div className="og-form-actions">
            <button type="submit" className="btn-primary">
              {t("פתח משחק")}
            </button>
            <button type="button" className="btn-quiet" onClick={() => setOpening(false)}>
              {t("ביטול")}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="og-open-btn" onClick={() => setOpening(true)}>
          <PlusIcon aria-hidden="true" />
          {t("פתח משחק")}
        </button>
      )}

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
