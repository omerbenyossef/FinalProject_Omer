import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon, SearchIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { formatDayMonth } from "../matchUtils.js";

/* The admin's own screen: everyone in the app, and every league in it —
   including the ones the admin isn't a member of, which is the whole point.
   The server refuses this data to anyone else (403); hiding the way in is
   only a courtesy on top of that. */

const TABS = ["users", "leagues"];

function levelText(levels) {
  if (!levels?.length) return "—";
  return levels.map((l) => `${l.provisional ? "~" : ""}${l.level.toFixed(1)}`).join(" · ");
}

export default function AdminDirectory() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("users");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .adminDirectory()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const needle = query.trim().toLowerCase();

  const users = useMemo(() => {
    const rows = data?.users ?? [];
    if (!needle) return rows;
    return rows.filter(
      (u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
    );
  }, [data, needle]);

  const leagues = useMemo(() => {
    const rows = data?.leagues ?? [];
    if (!needle) return rows;
    return rows.filter(
      (l) =>
        l.name.toLowerCase().includes(needle) ||
        (l.creator_name ?? "").toLowerCase().includes(needle)
    );
  }, [data, needle]);

  if (error) {
    return (
      <div className="adm">
        <div className="adm-nav">
          <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="sched-nav-label">{t("ניהול")}</span>
        </div>
        <p className="error">{t(error)}</p>
      </div>
    );
  }

  return (
    <div className="adm">
      <div className="adm-nav">
        <button type="button" className="sched-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="sched-nav-label">{t("ניהול")}</span>
      </div>

      {!data ? (
        <SkeletonBar width={220} height={38} style={{ marginTop: 18 }} />
      ) : (
        <>
          <div className="adm-totals">
            <div className="adm-total">
              <div className="adm-total-value" dir="ltr">{data.users.length}</div>
              <div className="adm-total-label">{t("PLAYERS")}</div>
            </div>
            <div className="adm-total">
              <div className="adm-total-value" dir="ltr">{data.leagues.length}</div>
              <div className="adm-total-label">{t("LEAGUES")}</div>
            </div>
          </div>

          <div className="adm-tabs">
            {TABS.map((key) => (
              <button
                type="button"
                key={key}
                className={`adm-tab${tab === key ? " on" : ""}`}
                onClick={() => setTab(key)}
              >
                {key === "users" ? t("משתמשים") : t("ליגות")}
              </button>
            ))}
          </div>

          <div className="adm-search">
            <SearchIcon width={16} height={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "users" ? t("חיפוש לפי שם או אימייל") : t("חיפוש לפי שם ליגה או מי פתח")}
            />
          </div>

          {tab === "users" ? (
            <div className="adm-rows">
              {users.map((u) => (
                <Link to={`/players/${u.id}`} className="adm-row" key={u.id}>
                  <Avatar name={u.name} photoUrl={u.photo_url} size={34} />
                  <div className="adm-row-body">
                    <div className="adm-row-title">
                      <span dir="auto" style={{ unicodeBidi: "isolate" }}>{u.name}</span>
                      {u.is_admin && <span className="adm-badge">{t("אדמין")}</span>}
                    </div>
                    <div className="adm-row-sub" dir="ltr">{u.email}</div>
                    <div className="adm-row-meta" dir="ltr">
                      NTRP {levelText(u.levels)} · {u.leagues} {t("ליגות")} · {u.matches_played}{" "}
                      {t("שוחקו")}
                      {u.created_at ? ` · ${formatDayMonth(new Date(u.created_at))}` : ""}
                    </div>
                  </div>
                  <ChevronIcon className="adm-row-chev chevron-icon" aria-hidden="true" />
                </Link>
              ))}
              {users.length === 0 && <p className="muted">{t("לא נמצאו שחקנים")}</p>}
            </div>
          ) : (
            <div className="adm-rows">
              {leagues.map((l) => (
                <Link to={`/leagues/${l.id}`} className="adm-row" key={l.id}>
                  <div className="adm-row-body">
                    <div className="adm-row-title">
                      <span dir="auto" style={{ unicodeBidi: "isolate" }}>{l.name}</span>
                      <span className={`adm-badge${l.is_open ? " open" : ""}`}>
                        {l.is_open ? t("ציבורית") : t("פרטית")}
                      </span>
                    </div>
                    <div className="adm-row-sub">
                      {t("{sport} · נפתחה על ידי {name}", {
                        sport: t(l.sport_name),
                        name: l.creator_name || "—",
                      })}
                    </div>
                    <div className="adm-row-meta" dir="ltr">
                      {l.member_count}
                      {l.capacity != null ? `/${l.capacity}` : ""} {t("שחקנים")} ·{" "}
                      {l.matches_played}/{l.matches_total} {t("שוחקו")}
                      {l.level_min != null && l.level_max != null
                        ? ` · NTRP ${l.level_min.toFixed(1)}–${l.level_max.toFixed(1)}`
                        : ""}
                      {l.created_at ? ` · ${formatDayMonth(new Date(l.created_at))}` : ""}
                    </div>
                  </div>
                  <ChevronIcon className="adm-row-chev chevron-icon" aria-hidden="true" />
                </Link>
              ))}
              {leagues.length === 0 && <p className="muted">{t("לא נמצאו ליגות")}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
