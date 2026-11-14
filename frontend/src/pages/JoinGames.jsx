import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useLiveData } from "../liveData.js";
import { CheckIcon, CloseIcon, PinIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import Toggle from "../Toggle.jsx";
import { weekdayFull } from "../matchUtils.js";

/* 213a/213b/212b — join a game.

   The tab it replaces tried to be two screens at once: the games I opened,
   the games I could take, and a button to open another. So the one thing
   somebody comes here to do — take a seat in somebody else's game — shared
   the screen with two things they didn't.

   This page has one job. A game I am already in is not on it (it is in my
   matches), there is no "open a game" button on it, and the only control is
   the one that decides whether a game is reachable at all: where it is. */

const CLEAR_AFTER_MS = 3000;
const MAX_SUGGESTIONS = 5;

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

// "Hosted by Omer" wants the name people call them, not the name on the
// league table. A single word is already a first name.
function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "";
}

export default function JoinGames() {
  const { selectedSportId } = useSport();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [games, setGames] = useState(null);
  const [cityData, setCityData] = useState(null);
  const [cityId, setCityId] = useState(undefined); // undefined = not loaded yet
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [format, setFormat] = useState("all");
  // What a tap on Join did, before the server has agreed to it. The card
  // reads this first so it answers the finger rather than the network.
  const [taken, setTaken] = useState({});
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const cityName = useCallback(
    (city) => (city ? (language === "en" ? city.name_en : city.name_he) : ""),
    [language]
  );

  const cities = useMemo(() => cityData?.cities ?? [], [cityData]);
  const selectedCity = cities.find((c) => c.id === cityId) ?? null;

  const loadCities = useCallback(() => {
    if (!selectedSportId) return;
    api
      .cities(selectedSportId)
      .then((data) => {
        setCityData(data);
        // The server remembers where this player was looking; the first load
        // is the only one allowed to move the filter under them.
        setCityId((current) => (current === undefined ? data.selected_id ?? null : current));
      })
      .catch(() => setCityData({ cities: [], recent_ids: [] }));
  }, [selectedSportId]);

  const loadGames = useCallback(() => {
    if (!selectedSportId || cityId === undefined) return;
    api
      .openGames(selectedSportId, { cityId })
      .then(setGames)
      .catch(() => setGames([]));
  }, [selectedSportId, cityId]);

  useEffect(loadCities, [loadCities]);
  useEffect(loadGames, [loadGames]);
  // Somebody else opening a game is the whole point of this screen.
  useLiveData(loadGames);

  function chooseCity(id) {
    setCityId(id);
    setQuery("");
    setTyping(false);
    inputRef.current?.blur();
    api.selectCity(id).then(setCityData).catch(() => {});
  }

  // Only the games this page is about: somebody else's, with a seat free.
  // A game I am in is in my matches, and a full one is not an offer.
  const offers = useMemo(() => {
    const rows = (games ?? []).filter((g) => !g.mine && !g.joined && !g.blocked_reason);
    const kept = rows.filter((g) => {
      if (format === "singles") return !g.is_doubles;
      if (format === "doubles") return g.is_doubles;
      if (format === "today")
        return new Date(g.starts_at).toDateString() === new Date().toDateString();
      return true;
    });
    return kept.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }, [games, format]);

  // A game I have just taken a seat in stays on screen long enough to say so,
  // then leaves: it is mine now, and this page is other people's games.
  const shown = offers.filter((g) => taken[g.id]?.gone !== true);

  async function join(game) {
    const spotsAfter = Math.max(0, game.seats_left - (game.is_doubles ? 2 : 1));
    setTaken((current) => ({ ...current, [game.id]: { in: true, spots: spotsAfter } }));
    setError("");
    try {
      const after = await api.joinOpenGame(game.id);
      setTaken((current) => ({
        ...current,
        [game.id]: { in: true, spots: after.seats_left, matchId: after.match_id },
      }));
      window.setTimeout(
        () =>
          setTaken((current) => ({
            ...current,
            [game.id]: { ...(current[game.id] || {}), gone: true },
          })),
        CLEAR_AFTER_MS
      );
    } catch (err) {
      // Somebody took the last seat while this one was being tapped. The card
      // goes back to what it was and says why.
      setTaken((current) => {
        const { [game.id]: _undone, ...rest } = current;
        return rest;
      });
      setError(err.message);
      loadGames();
    }
  }

  function setAlert(enabled) {
    api
      .setOpenGameAlert(enabled, cityId ?? null)
      .then(setCityData)
      .catch(() => {});
  }

  // 213b — matching is by prefix in either language, so somebody typing "tel"
  // and somebody typing "תל" land in the same place. Busiest city first:
  // when two names both match, the one with games in it is the better guess.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return cities
      .filter(
        (c) =>
          c.name_en.toLowerCase().startsWith(q) ||
          c.name_he.startsWith(query.trim()) ||
          c.name_en.toLowerCase().includes(` ${q}`)
      )
      .sort((a, b) => b.games - a.games || cityName(a).localeCompare(cityName(b)))
      .slice(0, MAX_SUGGESTIONS);
  }, [cities, query, cityName]);

  const recent = (cityData?.recent_ids ?? [])
    .map((id) => cities.find((c) => c.id === id))
    .filter(Boolean)
    .filter((c) => c.id !== cityId);

  // The matched prefix in accent, the rest plain: the row shows why it is
  // being offered.
  function highlight(city) {
    const label = cityName(city);
    const q = query.trim();
    const hit = label.toLowerCase().startsWith(q.toLowerCase()) ? q.length : 0;
    if (!hit) return label;
    return (
      <>
        <span className="jg-sug-hit">{label.slice(0, hit)}</span>
        {label.slice(hit)}
      </>
    );
  }

  function card(game) {
    const start = new Date(game.starts_at);
    const host = firstName(game.host_names?.[0] || game.creator_name);
    const state = taken[game.id];
    const spots = state ? state.spots : game.seats_left;
    const full = spots <= 0;

    return (
      <article className="jg-card" key={game.id}>
        <div className="jg-top">
          <div className="jg-when">
            <span className="jg-when-day">{dayWord(start, t)}</span>
            <span className="jg-when-time" dir="ltr">
              {hhmm(start)}
            </span>
            <span className="jg-when-date" dir="ltr">
              {`${start.getDate()} ${start.toLocaleString(language === "en" ? "en" : "he", { month: "short" })}`}
            </span>
          </div>
          <div className="jg-text">
            <span className="jg-host">{t("פתח/ה: {name}", { name: host })}</span>
            <h3 className="jg-title" dir="auto">
              {game.where
                ? t("{format} ב{venue}", {
                    format: game.is_doubles ? t("זוגות") : t("יחידים"),
                    venue: game.where,
                  })
                : game.is_doubles
                  ? t("זוגות")
                  : t("יחידים")}
            </h3>
            <span className="jg-level" dir="auto">
              {t("רמה NTRP {min}–{max}", {
                min: game.level_min.toFixed(1),
                max: game.level_max.toFixed(1),
              })}
            </span>
          </div>
        </div>

        <div className="jg-foot">
          <div className="jg-status">
            <span className="jg-status-main">
              {state?.in
                ? full
                  ? t("האירוע מלא")
                  : spots === 1
                    ? t("אתה בפנים · נותר מקום אחד")
                    : t("אתה בפנים · נותרו {n} מקומות", { n: spots })
                : spots === 1
                  ? t("נותר מקום אחד")
                  : t("נותרו {n} מקומות", { n: spots })}
            </span>
            <span className="jg-status-sub" dir="auto">
              {state?.in
                ? t("אתה ו-{name} · מאושר", { name: host })
                : spots === 1
                  ? t("{name} מחפש/ת שחקן", { name: host })
                  : t("{name} מחפש/ת שחקנים", { name: host })}
            </span>
          </div>

          {state?.in ? (
            <button
              type="button"
              className="jg-in"
              onClick={() =>
                navigate(state.matchId ? `/matches/${state.matchId}` : "/games?tab=matches")
              }
            >
              <CheckIcon aria-hidden="true" />
              {t("אתה בפנים · נמצא במשחקים שלי")}
            </button>
          ) : (
            <button type="button" className="jg-join" onClick={() => join(game)}>
              {t("הצטרף לאירוע של {name}", { name: host })}
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="jg">
      <h1 className="jg-h1">{t("הצטרף לאירוע")}</h1>

      <div className="jg-search">
        <div className={`jg-field${selectedCity || typing ? " is-on" : ""}`}>
          <PinIcon aria-hidden="true" />
          {selectedCity && !typing ? (
            <>
              <span className="jg-field-city" dir="auto">
                {cityName(selectedCity)}
              </span>
              <button
                type="button"
                className="jg-clear"
                aria-label={t("נקה")}
                onClick={() => chooseCity(null)}
              >
                <CloseIcon aria-hidden="true" />
              </button>
            </>
          ) : (
            <input
              ref={inputRef}
              className="jg-input"
              value={query}
              placeholder={t("חפש אזור, למשל תל אביב")}
              onChange={(e) => {
                setQuery(e.target.value);
                setTyping(true);
              }}
              onFocus={() => setTyping(true)}
              onBlur={() => window.setTimeout(() => setTyping(false), 150)}
            />
          )}
        </div>
      </div>

      {typing && query.trim() && (
        <div className="jg-sug">
          {suggestions.length === 0 ? (
            <div className="jg-sug-row jg-sug-row--empty">{t("לא נמצאה עיר כזאת")}</div>
          ) : (
            suggestions.map((city) => (
              <button
                type="button"
                key={city.id}
                className="jg-sug-row"
                // onMouseDown, not onClick: the input's blur fires first and
                // would unmount the row before the click landed on it.
                onMouseDown={(e) => {
                  e.preventDefault();
                  chooseCity(city.id);
                }}
              >
                <PinIcon aria-hidden="true" />
                <span className="jg-sug-name" dir="auto">
                  {highlight(city)}
                </span>
                <span className="jg-sug-count">
                  {city.games === 0
                    ? t("עוד אין אירועים")
                    : city.games === 1
                      ? t("אירוע אחד")
                      : t("{n} אירועים", { n: city.games })}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {typing && recent.length > 0 && (
        <div className="jg-recent">
          <span className="jg-recent-label">{t("אחרונים")}</span>
          <div className="jg-recent-chips">
            {recent.map((city) => (
              <button
                type="button"
                key={city.id}
                className="jg-chip"
                onMouseDown={(e) => {
                  e.preventDefault();
                  chooseCity(city.id);
                }}
              >
                {cityName(city)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!typing && (
        <div className="jg-formats">
          {[
            { key: "all", label: t("הכל") },
            { key: "today", label: t("היום") },
            { key: "singles", label: t("יחידים") },
            { key: "doubles", label: t("זוגות") },
          ].map((item) => (
            <button
              type="button"
              key={item.key}
              className={`jg-format${format === item.key ? " is-on" : ""}`}
              aria-pressed={format === item.key}
              onClick={() => setFormat(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {(selectedCity || format !== "all") && games != null && (
        <p className="jg-count">
          {shown.length === 1 ? t("אירוע אחד") : t("{n} אירועים", { n: shown.length })}
          {selectedCity && (
            <>
              {` ${t("ב")}`}
              <span className="jg-count-city" dir="auto">
                {cityName(selectedCity)}
              </span>
            </>
          )}
        </p>
      )}

      {error && <p className="jg-error error">{t(error)}</p>}

      {games == null ? (
        <SkeletonBar />
      ) : shown.length > 0 ? (
        <div className="jg-list">{shown.map(card)}</div>
      ) : (
        <div className="jg-empty">
          <h2 className="jg-empty-title">
            {selectedCity
              ? t("אין אירועים פתוחים ב{city}", { city: cityName(selectedCity) })
              : t("אין אירועים פתוחים כרגע")}
          </h2>
          {!selectedCity && (
            <p className="jg-empty-text">{t("כששחקן ברמה שלך יפתח אירוע, הוא יופיע כאן.")}</p>
          )}
          <label className="jg-notify">
            <span>
              {selectedCity
                ? t("עדכנו אותי על אירועים ב{city}", { city: cityName(selectedCity) })
                : t("עדכנו אותי כשנפתח אירוע")}
            </span>
            <Toggle
              checked={Boolean(cityData?.notify_open_games)}
              onChange={(next) => setAlert(next)}
            />
          </label>
          {selectedCity && (
            <button type="button" className="jg-showall" onClick={() => chooseCity(null)}>
              {t("הצג את כל האזורים")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
