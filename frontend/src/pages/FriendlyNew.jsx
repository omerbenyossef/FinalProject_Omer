import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon, PlusIcon, SearchIcon } from "../Icons.jsx";

function playedSub(p, t) {
  if (p.wins > 0 || p.losses > 0) {
    return (
      <>
        <span className="mono-num">
          {p.wins}W-{p.losses}L
        </span>{" "}
        · {t("{n} ליגות משותפות", { n: p.shared_leagues })}
      </>
    );
  }
  return t("{n} ליגות משותפות", { n: p.shared_leagues });
}

export default function FriendlyNew() {
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invitingId, setInvitingId] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedSportId) return;
    setLoading(true);
    api
      .searchFriendlyPlayers(selectedSportId, query.trim())
      .then(setPlayers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedSportId, query]);

  async function handleInvite(playerId) {
    setInvitingId(playerId);
    setError("");
    try {
      await api.createFriendlyInvite(playerId, selectedSportId);
      navigate("/profile");
    } catch (err) {
      setError(err.message);
      setInvitingId(null);
    }
  }

  async function handleInviteByLink() {
    setLinkBusy(true);
    setError("");
    try {
      const { token } = await api.createFriendlyInviteLink(selectedSportId);
      const url = `${window.location.origin}/register?friendly=${token}`;
      if (navigator.share) {
        await navigator.share({ url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError(err.message || String(err));
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div>
      <header className="page-head">
        <Link to="/leagues" className="back-link">
          <ChevronIcon aria-hidden="true" />
          {t("משחק ידידותי חדש")}
        </Link>
        <h1 className="friendly-title">{t("נגד מי אתה משחק?")}</h1>
        <p className="friendly-subtitle">
          {t("משחק ידידותי נספר בדירוג האישי שלך. הוא לא משפיע על טבלאות הליגה.")}
        </p>
      </header>

      <div className="friendly-search">
        <SearchIcon width={16} height={16} aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("חיפוש שחקנים")}
        />
      </div>

      {error && <p className="error">{t(error)}</p>}

      {!query.trim() && (
        <div className="friendly-list-head">
          <span className="friendly-list-label">{t("שיחקתם בעבר")}</span>
        </div>
      )}
      <div className="friendly-player-list">
        {!loading &&
          players.map((p) => (
            <div className="friendly-player-row" key={p.id}>
              <Avatar name={p.name} size={38} />
              <div className="friendly-player-body">
                <div className="friendly-player-name">
                  <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                    {p.name}
                  </span>
                </div>
                <div className="friendly-player-sub" dir="ltr">
                  {playedSub(p, t)}
                </div>
              </div>
              <button
                type="button"
                className="my-match-report"
                disabled={invitingId === p.id}
                onClick={() => handleInvite(p.id)}
              >
                <span className="my-match-dot" aria-hidden="true" />
                {t("הזמן")}
              </button>
            </div>
          ))}
        {!loading && players.length === 0 && (
          <p className="muted">
            {query.trim() ? t("לא נמצאו שחקנים") : t("עדיין לא שיחקת נגד אף אחד בענף הזה.")}
          </p>
        )}
      </div>

      {!query.trim() && (
        <>
          <div className="friendly-list-head">
            <span className="friendly-list-label">{t("לא ב-Rally")}</span>
          </div>
          <button
            type="button"
            className="friendly-player-row friendly-link-row"
            onClick={handleInviteByLink}
            disabled={linkBusy}
          >
            <Avatar dim icon={<PlusIcon width={16} height={16} aria-hidden="true" />} size={38} />
            <div className="friendly-player-body">
              <div className="friendly-player-name">{t("הזמנה בקישור")}</div>
              <div className="friendly-player-sub">{t("וואטסאפ, או העתקת הקישור")}</div>
            </div>
            <ChevronIcon className="chevron-icon" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
