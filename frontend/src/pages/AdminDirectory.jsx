import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { useSport } from "../SportContext.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon, SearchIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { formatDayMonth } from "../matchUtils.js";
import { toWideJpeg } from "../imageScale.js";

/* The admin's own screen: everyone in the app, and every league in it —
   including the ones the admin isn't a member of, which is the whole point.
   The server refuses this data to anyone else (403); hiding the way in is
   only a courtesy on top of that. */

const TABS = ["users", "leagues", "venues"];

// Two letters standing in for a photograph nobody has taken yet, so every
// card and row keeps the same shape either way.
export function initialsOf(name) {
  return (name || "").trim().slice(0, 2);
}

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
  // Two taps to close an account, and the second one lives on the row itself:
  // a native confirm is a thumb-width away from "OK" on a phone, and this is
  // not undoable.
  const { sports } = useSport();
  const [venues, setVenues] = useState([]);
  // The venue being added or edited: null when the form is closed, an object
  // with an id when editing, an object without one when adding.
  const [venueDraft, setVenueDraft] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const imageInputRef = useRef(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api
      .adminDirectory()
      .then(setData)
      .catch((err) => setError(err.message));
    loadVenues();
  }, []);

  function loadVenues() {
    api.venues().then(setVenues).catch(() => setVenues([]));
  }

  async function saveVenue(draft) {
    const body = {
      name: draft.name.trim(),
      area: draft.area?.trim() || null,
      sport_id: draft.sport_id ?? null,
      booking_url: draft.booking_url?.trim() || null,
    };
    setBusyId("venue");
    setError("");
    try {
      if (draft.id) await api.updateVenue(draft.id, body);
      else await api.createVenue(body);
      setVenueDraft(null);
      loadVenues();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function uploadVenueImage(file) {
    if (!file || !venueDraft?.id) return;
    setBusyId("venue-image");
    setError("");
    try {
      const saved = await api.setVenueImage(venueDraft.id, await toWideJpeg(file));
      setVenueDraft({ ...venueDraft, image_url: saved.image_url });
      loadVenues();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeVenueImage() {
    if (!venueDraft?.id) return;
    setBusyId("venue-image");
    setError("");
    try {
      await api.deleteVenueImage(venueDraft.id);
      setVenueDraft({ ...venueDraft, image_url: null });
      loadVenues();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeVenue(venue) {
    setBusyId(`venue-${venue.id}`);
    setError("");
    try {
      await api.deleteVenue(venue.id);
      loadVenues();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u) {
    setBusyId(u.id);
    setError("");
    try {
      const res = await api.adminDeleteUser(u.id);
      setData((prev) => ({ ...prev, users: prev.users.filter((row) => row.id !== u.id) }));
      setNotice(res.message);
      setConfirmingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

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

          {notice && <p className="adm-notice">{notice}</p>}
          {error && <p className="error">{t(error)}</p>}

          <div className="adm-tabs">
            {TABS.map((key) => (
              <button
                type="button"
                key={key}
                className={`adm-tab${tab === key ? " on" : ""}`}
                onClick={() => setTab(key)}
              >
                {key === "users" ? t("משתמשים") : key === "leagues" ? t("ליגות") : t("מגרשים")}
              </button>
            ))}
          </div>

          <div className="adm-search">
            <SearchIcon width={16} height={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "users"
                  ? t("חיפוש לפי שם או אימייל")
                  : tab === "leagues"
                    ? t("חיפוש לפי שם ליגה או מי פתח")
                    : t("חיפוש מגרש")
              }
            />
          </div>

          {tab === "users" ? (
            <div className="adm-rows">
              {users.map((u) =>
                confirmingId === u.id ? (
                  <div className="adm-row adm-row--confirm" key={u.id}>
                    <div className="adm-row-body">
                      <div className="adm-confirm-title">
                        {t("למחוק את החשבון של {name}?", { name: u.name })}
                      </div>
                      <div className="adm-confirm-text">
                        {t(
                          "משחקים שלא שוחקו יימחקו, תוצאות שכבר נרשמו יישארו כדי לא לשנות טבלאות של אחרים, והוא לא יוכל להתחבר שוב. אין דרך חזרה."
                        )}
                      </div>
                      <div className="adm-confirm-actions">
                        <button
                          type="button"
                          className="adm-confirm-go"
                          disabled={busyId === u.id}
                          onClick={() => handleDelete(u)}
                        >
                          {busyId === u.id ? t("מוחק...") : t("כן, למחוק")}
                        </button>
                        <button
                          type="button"
                          className="adm-confirm-cancel"
                          onClick={() => setConfirmingId(null)}
                        >
                          {t("ביטול")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="adm-row" key={u.id}>
                    <Link to={`/players/${u.id}`} className="adm-row-link">
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
                    </Link>
                    {/* The admin's own account, and any other admin, has no
                        delete here — the server refuses both anyway. */}
                    {!u.is_admin && (
                      <button
                        type="button"
                        className="adm-row-del"
                        onClick={() => {
                          setNotice("");
                          setConfirmingId(u.id);
                        }}
                        aria-label={t("מחיקת חשבון")}
                      >
                        {t("מחק")}
                      </button>
                    )}
                  </div>
                )
              )}
              {users.length === 0 && <p className="muted">{t("לא נמצאו שחקנים")}</p>}
            </div>
          ) : tab === "leagues" ? (
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
          ) : (
            <div className="adm-rows">
              <button
                type="button"
                className="adm-add"
                onClick={() => setVenueDraft({ name: "", area: "", sport_id: null, booking_url: "" })}
              >
                {t("הוספת מגרש")}
              </button>

              {venueDraft && (
                <form
                  className="adm-venue-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!venueDraft.name.trim()) return;
                    saveVenue(venueDraft);
                  }}
                >
                  {/* Only once the venue exists: the picture belongs to an
                      id, so a new venue is saved first and given one after. */}
                  {venueDraft.id && (
                    <div className="adm-venue-image">
                      <div className="adm-venue-preview">
                        {venueDraft.image_url ? (
                          <img src={mediaUrl(venueDraft.image_url)} alt="" />
                        ) : (
                          <span className="adm-venue-initials" dir="auto">
                            {initialsOf(venueDraft.name)}
                          </span>
                        )}
                      </div>
                      <div className="adm-venue-image-actions">
                        <button
                          type="button"
                          className="mc-cancel"
                          disabled={busyId === "venue-image"}
                          onClick={() => imageInputRef.current?.click()}
                        >
                          {busyId === "venue-image"
                            ? t("מעלה…")
                            : venueDraft.image_url
                              ? t("החלפת תמונה")
                              : t("העלאת תמונה")}
                        </button>
                        {venueDraft.image_url && (
                          <button
                            type="button"
                            className="link-btn adm-venue-image-remove"
                            disabled={busyId === "venue-image"}
                            onClick={removeVenueImage}
                          >
                            {t("הסרה")}
                          </button>
                        )}
                      </div>
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          uploadVenueImage(file);
                        }}
                      />
                    </div>
                  )}
                  <input
                    value={venueDraft.name}
                    onChange={(e) => setVenueDraft({ ...venueDraft, name: e.target.value })}
                    placeholder={t("שם המגרש")}
                    autoFocus
                  />
                  <input
                    value={venueDraft.area ?? ""}
                    onChange={(e) => setVenueDraft({ ...venueDraft, area: e.target.value })}
                    placeholder={t("אזור")}
                  />
                  <select
                    value={venueDraft.sport_id ?? ""}
                    onChange={(e) =>
                      setVenueDraft({
                        ...venueDraft,
                        sport_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">{t("כל הענפים")}</option>
                    {sports.map((sport) => (
                      <option value={sport.id} key={sport.id}>
                        {t(sport.name)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={venueDraft.booking_url ?? ""}
                    onChange={(e) => setVenueDraft({ ...venueDraft, booking_url: e.target.value })}
                    placeholder={t("קישור הזמנה")}
                    dir="ltr"
                  />
                  <div className="adm-venue-actions">
                    <button type="submit" className="mc-go" disabled={busyId === "venue"}>
                      {busyId === "venue" ? t("שומר...") : t("שמור")}
                    </button>
                    <button type="button" className="mc-cancel" onClick={() => setVenueDraft(null)}>
                      {t("ביטול")}
                    </button>
                  </div>
                </form>
              )}

              {venues
                .filter(
                  (v) =>
                    !needle ||
                    v.name.toLowerCase().includes(needle) ||
                    (v.area ?? "").toLowerCase().includes(needle)
                )
                .map((v) => (
                  <div className="adm-row" key={v.id}>
                    <div className="adm-venue-thumb">
                      {v.image_url ? (
                        <img src={mediaUrl(v.image_url)} alt="" loading="lazy" />
                      ) : (
                        <span className="adm-venue-initials is-small" dir="auto">
                          {initialsOf(v.name)}
                        </span>
                      )}
                    </div>
                    <div className="adm-row-body">
                      <div className="adm-row-title">
                        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                          {v.name}
                        </span>
                        <span className="adm-badge">{v.sport_name ? t(v.sport_name) : t("כל הענפים")}</span>
                      </div>
                      <div className="adm-row-sub">{v.area || t("בלי אזור")}</div>
                      <div className="adm-row-meta" dir="ltr">
                        {v.booking_url || t("בלי קישור הזמנה")}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="adm-row-edit"
                      onClick={() => setVenueDraft({ ...v })}
                    >
                      {t("עריכה")}
                    </button>
                    <button
                      type="button"
                      className="adm-row-del"
                      disabled={busyId === `venue-${v.id}`}
                      onClick={() => removeVenue(v)}
                    >
                      {t("מחק")}
                    </button>
                  </div>
                ))}
              {venues.length === 0 && !venueDraft && (
                <p className="muted">{t("עוד אין מגרשים. הוסף את הראשון.")}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
