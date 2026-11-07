import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import { useLanguage } from "./LanguageContext.jsx";
import Avatar from "./Avatar.jsx";
import { tintColor } from "./tint.js";
import { formatSets, weekdayName, dayMonthPadded as dayMonth } from "./matchUtils.js";
import { PinIcon } from "./Icons.jsx";

/* 203b — "around you".

   Everything else on the home screen is the player's own business. This is
   the only part of the app that says anybody else is playing at all, which
   is most of what made it feel closed: a league you cannot see anybody in is
   a spreadsheet with your name on it.

   Each row is a sentence, a face and at most one thing to do. The server
   sends what happened; the wording lives here, with the rest of the copy. */

// A row nobody did — a league starting, or the generic lines a thin feed is
// padded with — has no face to show, so it shows the sport's own mark.
function Face({ item }) {
  if (item.type === "venue")
    return (
      <span className="af-face" aria-hidden="true">
        <PinIcon />
      </span>
    );
  if (item.type === "invite_friend")
    return (
      <span className="af-face" aria-hidden="true">
        +
      </span>
    );
  if (item.type === "players_joined" || item.type === "players_near") {
    return (
      <span className="af-stack" aria-hidden="true">
        {(item.people ?? []).slice(0, 3).map((person) => (
          <Avatar
            key={person.id}
            name={person.name}
            photoUrl={person.photo_url}
            size={30}
            background={tintColor(person.name)}
            color="#0e1116"
          />
        ))}
      </span>
    );
  }
  if (!item.actor_name) {
    return (
      <span className="af-face af-face--none" aria-hidden="true">
        ★
      </span>
    );
  }
  return (
    <Avatar
      name={item.actor_name}
      photoUrl={item.actor_photo_url}
      size={38}
      background={tintColor(item.actor_name)}
      color="#0e1116"
    />
  );
}

export default function ActivityFeed({ items, onChanged }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  // The clap has to answer the tap, not the next refetch: the count moves
  // here and the server is told after, and if it refuses, the row goes back
  // to what the server last said.
  const [local, setLocal] = useState({});

  const clap = useCallback(
    (item) => {
      if (!item.id) return;
      const now = local[item.id] ?? { claps: item.claps, i_clapped: item.i_clapped };
      const next = {
        claps: now.claps + (now.i_clapped ? -1 : 1),
        i_clapped: !now.i_clapped,
      };
      setLocal((current) => ({ ...current, [item.id]: next }));
      api
        .clapActivity(item.id)
        .then((data) => setLocal((current) => ({ ...current, [item.id]: data })))
        .catch(() =>
          setLocal((current) => {
            const { [item.id]: _gone, ...rest } = current;
            return rest;
          })
        )
        .finally(() => onChanged?.());
    },
    [local, onChanged]
  );

  // The names and the numbers in a feed line are bold, and translate() hands
  // back the sentence with its placeholders still in it — so the line is
  // split on them and only the pieces between are plain text. One helper,
  // because every type's sentence has the same shape.
  function fill(template, slots) {
    const keys = Object.keys(slots);
    if (!keys.length) return template;
    const pattern = new RegExp(`(${keys.map((k) => `\\{${k}\\}`).join("|")})`);
    return template.split(pattern).map((part, i) => {
      const key = part.startsWith("{") ? part.slice(1, -1) : null;
      return key && key in slots ? <span key={i}>{slots[key]}</span> : <span key={i}>{part}</span>;
    });
  }

  const strong = (text, className = "af-strong") => (
    <strong className={className} dir="auto">
      {text}
    </strong>
  );

  function sentence(item) {
    switch (item.type) {
      case "match_result": {
        const score = formatSets(item.payload?.sets ?? []);
        return (
          <>
            {fill(t("{winner} ניצח את {loser}"), {
              winner: strong(item.actor_name),
              loser: strong(item.target_name),
            })}
            {score ? (
              <>
                {" "}
                <span className="af-score" dir="ltr">
                  {score}
                </span>
              </>
            ) : null}
          </>
        );
      }
      case "level_up":
        return (
          <>
            {fill(t("{name} עלה ל-NTRP {level}"), {
              name: strong(item.actor_name),
              level: strong(Number(item.payload?.level ?? 0).toFixed(1), "af-strong af-accent"),
            })}{" "}
            🎉
          </>
        );
      case "players_joined":
        return item.count === 1
          ? t("שחקן חדש ברמה שלך הצטרף")
          : fill(t("{n} שחקנים חדשים ברמה שלך הצטרפו"), { n: strong(item.count) });
      case "open_game_created":
        return fill(t("{name} מחפש שותפים למשחק"), { name: strong(item.actor_name) });
      case "league_started":
        return fill(t("{league} יצאה לדרך"), {
          league: strong(item.payload?.name ?? item.league_name ?? ""),
        });
      case "venue":
        return fill(t("אפשר להזמין מגרש ב{venue}"), { venue: strong(item.venue?.name ?? "") });
      case "invite_friend":
        return t("הזמן חבר לשחק");
      case "players_near":
        return fill(t("{n} שחקנים ברמה שלך ב{area}"), {
          n: strong(item.count),
          area: strong(item.payload?.area ?? ""),
        });
      default:
        return item.payload?.text ?? "";
    }
  }

  // The phone's own share sheet, the same way the open-game and partner
  // screens do it, with the clipboard where there is no sheet to open.
  async function invite() {
    const url = window.location.origin;
    const text = t("בוא לשחק איתי ב-Rally");
    try {
      if (navigator.share) await navigator.share({ text: `${text}\n${url}` });
      else await navigator.clipboard?.writeText(`${text}\n${url}`);
    } catch {
      // A dismissed share sheet is not an error worth a message.
    }
  }

  function sub(item) {
    if (item.type === "open_game_created" && item.payload?.starts_at) {
      const when = new Date(item.payload.starts_at);
      return `${weekdayName(when, t)} ${dayMonth(when)}`;
    }
    if (item.type === "league_started" && item.payload?.players) {
      return t("{n} שחקנים", { n: item.payload.players });
    }
    if (item.type === "match_result" && item.league_name) {
      return item.league_name;
    }
    return null;
  }

  function action(item) {
    if (item.type === "players_joined")
      return (
        <button type="button" className="af-btn" onClick={() => navigate("/friendly/new")}>
          {t("להגיד שלום")}
        </button>
      );
    if (item.type === "open_game_created")
      return (
        <button type="button" className="af-btn" onClick={() => navigate("/games/open")}>
          {t("הצטרף")}
        </button>
      );
    if (item.type === "league_started" && item.league_id)
      return (
        <button
          type="button"
          className="af-btn"
          onClick={() => navigate(`/leagues/${item.league_id}`)}
        >
          {t("צפה")}
        </button>
      );
    if (item.type === "venue")
      return (
        <a
          className="af-btn"
          href={item.venue.booking_url}
          target="_blank"
          rel="noreferrer noopener"
        >
          {t("צפה")}
        </a>
      );
    if (item.type === "invite_friend")
      return (
        <button type="button" className="af-btn" onClick={invite}>
          {t("הזמן")}
        </button>
      );
    if (item.type === "players_near")
      return (
        <button type="button" className="af-btn" onClick={() => navigate("/ranks")}>
          {t("לראות")}
        </button>
      );
    if (!item.id) return null;
    const state = local[item.id] ?? { claps: item.claps, i_clapped: item.i_clapped };
    return (
      <button
        type="button"
        className={`af-clap${state.i_clapped ? " is-on" : ""}`}
        onClick={() => clap(item)}
        aria-label={t("כפיים")}
        aria-pressed={state.i_clapped}
      >
        <span aria-hidden="true">👏</span>
        {state.claps > 0 && (
          <span className="af-clap-n" dir="ltr">
            {state.claps}
          </span>
        )}
      </button>
    );
  }

  return (
    <ul className="af">
      {items.map((item, index) => (
        <li className="af-row" key={item.id ? `e${item.id}` : `${item.type}${index}`}>
          <Face item={item} />
          <div className="af-text">
            <span className="af-line">{sentence(item)}</span>
            {sub(item) && (
              <span className="af-sub" dir="auto">
                {sub(item)}
              </span>
            )}
          </div>
          <div className="af-side">{action(item)}</div>
        </li>
      ))}
    </ul>
  );
}
