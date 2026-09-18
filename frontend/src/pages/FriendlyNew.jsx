import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  const location = useLocation();
  const presetOpponent = location.state?.presetOpponent ?? null;
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invitingId, setInvitingId] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  // The copied link, kept on screen: a silent clipboard write is
  // indistinguishable from a button that does nothing.
  const [copiedLink, setCopiedLink] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedSportId || presetOpponent) return;
    setLoading(true);
    api
      .searchFriendlyPlayers(selectedSportId, query.trim())
      .then(setPlayers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedSportId, query, presetOpponent]);

  async function handleInvite(playerId) {
    setInvitingId(playerId);
    setError("");
    try {
      const match = await api.createFriendlyInvite(playerId, selectedSportId);
      // An invitation with no time is a question, so go straight on to the
      // time. Whatever they pick reaches the other player as one message, and
      // one tap from them accepts both the invitation and the time.
      navigate(`/matches/${match.id}/schedule`);
    } catch (err) {
      setError(err.message);
    } finally {
      setInvitingId(null);
    }
  }

  async function handleInviteByLink() {
    setLinkBusy(true);
    setError("");
    setCopiedLink("");
    try {
      const { token } = await api.createFriendlyInviteLink(selectedSportId);
      // Not /signup: the link has to work for a friend who already has an
      // account just as well as for one who doesn't, and it must not offer
      // the sender a way to register again and play themselves.
      const url = `${window.location.origin}/friendly/invite/${token}`;
      // The share sheet is its own confirmation. Without it, a clipboard write
      // says nothing at all, so the link goes on screen either way — and it is
      // the only way out if the clipboard refuses.
      if (navigator.share) {
        try {
          await navigator.share({ url });
        } catch (err) {
          if (err?.name !== "AbortError") setCopiedLink(url);
        }
      } else {
        try {
          await navigator.clipboard?.writeText(url);
        } catch {
          // Blocked clipboard — the link below is still usable.
        }
        setCopiedLink(url);
      }
    } catch (err) {
      setError(err.message || String(err));
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

      {presetOpponent ? (
        <div className="friendly-player-list">
          <div className="friendly-player-row" key={presetOpponent.id}>
            <Avatar name={presetOpponent.name} photoUrl={presetOpponent.photo_url} size={38} />
            <div className="friendly-player-body">
              <div className="friendly-player-name">
                <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                  {presetOpponent.name}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="my-match-report"
              disabled={invitingId === presetOpponent.id}
              onClick={() => handleInvite(presetOpponent.id)}
            >
              <span className="my-match-dot" aria-hidden="true" />
              {t("הזמן")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="friendly-search">
            <SearchIcon width={16} height={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("חיפוש שחקנים")}
            />
          </div>

          {!query.trim() && (
            <div className="friendly-list-head">
              <span className="friendly-list-label">{t("שיחקתם בעבר")}</span>
            </div>
          )}
          <div className="friendly-player-list">
            {!loading &&
              players.map((p) => (
                <div className="friendly-player-row" key={p.id}>
                  <Avatar name={p.name} photoUrl={p.photo_url} size={38} />
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
                    {invitingId === p.id ? t("שולח...") : t("הזמן")}
                  </button>
                </div>
              ))}
            {!loading && players.length === 0 && (
              <p className="muted">
                {query.trim() ? t("לא נמצאו שחקנים") : t("עדיין לא שיחקת נגד אף אחד בענף הזה.")}
              </p>
            )}
          </div>
        </>
      )}

      {error && <p className="error">{t(error)}</p>}

      {!presetOpponent && !query.trim() && (
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
              <div className="friendly-player-sub">
                {linkBusy ? t("מכין קישור...") : t("וואטסאפ, או העתקת הקישור")}
              </div>
            </div>
            <ChevronIcon className="chevron-icon" aria-hidden="true" />
          </button>

          {copiedLink && (
            <div className="friendly-copied">
              <p className="friendly-copied-title">{t("הקישור הועתק — אפשר לשלוח אותו")}</p>
              {/* Selectable, and the way out if the clipboard was blocked. */}
              <p className="friendly-copied-url" dir="ltr">
                {copiedLink}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
