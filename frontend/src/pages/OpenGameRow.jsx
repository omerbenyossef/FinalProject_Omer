import { useLanguage } from "../LanguageContext.jsx";
import { CheckIcon, PinIcon, PlusIcon } from "../Icons.jsx";
import { formatDayMonth, weekdayFull } from "../matchUtils.js";

/* 194a — one open game.
   What it used to be: a time, then the venue in the title slot (so a game with
   no venue was titled "place to be decided"), then a need count and a loose
   "you're in" next to a loose "close the game".

   What it is now: the date as a block, the title saying who opened it and what
   they are looking for, the venue as a venue, and the seats drawn as faces and
   empty chairs. The actions depend on which of the three relations the viewer
   has to the game, so nothing floats without a state behind it. */

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dayWord(date, t) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - start) / 86400000);
  if (days === 0) return t("היום");
  if (days === 1) return t("מחר");
  return weekdayFull(date, t);
}

export default function OpenGameRow({ game, onJoin, onLeave, onCancel, onShare, busy }) {
  const { t } = useLanguage();
  const start = new Date(game.starts_at);
  const mine = !!game.mine;
  const joined = !!game.joined && !mine;
  const quiet = mine || joined;

  const hours = Math.round((start - Date.now()) / 3600000);
  const urgency =
    hours >= 0 && hours < 24
      ? hours <= 1
        ? t("עוד שעה")
        : t("עוד {n} שעות", { n: hours })
      : null;

  // "נועם מחפש יריב", or in doubles "נועם ויעל מחפשים זוג".
  const hosts = game.host_names?.length ? game.host_names : [game.creator_name].filter(Boolean);
  const title = game.is_doubles
    ? t("{names} מחפשים זוג", { names: hosts.join(t(" ו")) })
    : t("{name} מחפש/ת יריב", { name: hosts[0] || "" });

  const need = game.seats_left;
  const seats = Array.from({ length: game.slots }, (_, i) => game.players[i] || null);

  return (
    <div className={`ogc${quiet ? " is-quiet" : ""}`}>
      {!quiet && <span className="ogc-glow" aria-hidden="true" />}

      <div className="ogc-top">
        <span className="ogc-date">
          <span className="ogc-date-day">{dayWord(start, t)}</span>
          {/* Anton carries digits but no Hebrew glyphs, so it is kept to the
              clock; the weekday above and the date below are Plex and mono. */}
          <span className="ogc-date-time" dir="ltr">
            {hhmm(start)}
          </span>
          <span className="ogc-date-dm" dir="ltr">
            {formatDayMonth(start)}
          </span>
        </span>

        <span className="ogc-info">
          {/* "אתה בפנים" is not repeated here: the pill in the action row below
              already says it, with a check on it, and printing it twice on one
              card read as a stutter. The status row is for what the rest of
              the card does not say. */}
          {(mine || urgency) && (
            <span className="ogc-status">
              {mine && <span className="ogc-status-mine">{t("האירוע שלך")}</span>}
              {urgency && (
                <span className="ogc-urgent">
                  <span className="ogc-urgent-dot" aria-hidden="true" />
                  {urgency}
                </span>
              )}
            </span>
          )}
          <span className="ogc-title" dir="auto" style={{ unicodeBidi: "isolate" }}>
            {title}
          </span>
          <span className="ogc-meta">
            {game.is_doubles ? t("זוגות") : t("יחידים")} ·{" "}
            <span className="ogc-ntrp" dir="ltr">
              NTRP {game.level_min.toFixed(1)}–{game.level_max.toFixed(1)}
            </span>
          </span>
          <span className="ogc-where">
            <PinIcon aria-hidden="true" />
            <span dir="auto" style={{ unicodeBidi: "isolate" }}>
              {game.where || t("מקום ייקבע יחד")}
            </span>
          </span>
        </span>
      </div>

      <div className="ogc-bottom">
        <span className="ogc-who">
          <span className="ogc-seats">
            {seats.map((p, i) =>
              p ? (
                <span className="ogc-seat" key={p.id} title={p.name}>
                  {(p.name || "").trim().slice(0, 1)}
                </span>
              ) : (
                /* An empty chair, not a missing avatar. */
                <span className="ogc-seat is-open" key={`open-${i}`} aria-hidden="true">
                  <PlusIcon />
                </span>
              )
            )}
          </span>
          {need > 0 && (
            <span className="ogc-need">
              {need === 1 ? t("חסר 1") : t("חסרים {n}", { n: need })}
            </span>
          )}
        </span>

        <span className="ogc-actions">
          {mine ? (
            <>
              <button type="button" className="ogc-link" onClick={onCancel} disabled={busy}>
                {t("לבטל אירוע")}
              </button>
              <button type="button" className="ogc-share" onClick={onShare}>
                {t("שתף")}
              </button>
            </>
          ) : joined ? (
            <>
              <button type="button" className="ogc-link" onClick={onLeave} disabled={busy}>
                {t("לצאת")}
              </button>
              <span className="ogc-in">
                <CheckIcon aria-hidden="true" />
                {t("אתה בפנים")}
              </span>
            </>
          ) : game.blocked_reason ? (
            <span className="ogc-blocked">{t(game.blocked_reason)}</span>
          ) : (
            <button type="button" className="ogc-join" onClick={onJoin} disabled={busy}>
              {busy ? t("מצטרף…") : t("הצטרף")}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
