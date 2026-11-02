import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Avatar from "../Avatar.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { useSport } from "../SportContext.jsx";
import { usePairs } from "../PairContext.jsx";
import { SkeletonBar } from "../Skeleton.jsx";

/* Padel is played four to a court, so before a padel player can do anything
   at all they need somebody to play with. This is that screen: the pairs they
   already have, the invitations waiting on either side, and who they could
   ask. It is the first thing a padel player sees after the questionnaire, and
   until they leave with a partner it is the only thing they can do. */

function levelLabel(level, provisional, t) {
  if (level == null) return null;
  return `${level.toFixed(1)}${provisional ? ` · ${t("זמני")}` : ""}`;
}

export default function Partners() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { selectedSportId, sports } = useSport();
  const { activePairs, pendingPairs, loading, reload } = usePairs();

  const [candidates, setCandidates] = useState(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");

  const sportName = sports.find((s) => s.id === selectedSportId)?.name;

  const loadCandidates = useCallback(async () => {
    if (!selectedSportId) return;
    try {
      setCandidates(await api.pairCandidates(selectedSportId, query));
    } catch (err) {
      setError(err.message);
      setCandidates([]);
    }
  }, [selectedSportId, query]);

  useEffect(() => {
    // Typing in the search box shouldn't fire a request per keystroke.
    const timer = setTimeout(loadCandidates, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadCandidates, query]);

  async function act(fn, id) {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await Promise.all([reload(), loadCandidates()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function shareInvite() {
    setSharing(true);
    setError("");
    try {
      const { token } = await api.createPairInviteLink(selectedSportId);
      const url = `${window.location.origin}/pairs/invite/${token}`;
      const message = t("רוצה להיות הצמד שלי ב-Rally? {url}", { url });
      // The native sheet where there is one — it offers WhatsApp alongside
      // everything else the phone can send to — and wa.me where there is not.
      if (navigator.share) {
        try {
          await navigator.share({ text: message });
          return;
        } catch {
          // Cancelled, or refused: fall through to WhatsApp rather than
          // leaving the tap with nothing to show for it.
        }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message);
    } finally {
      setSharing(false);
    }
  }

  const waitingOnMe = pendingPairs.filter((p) => !p.proposed_by_me);
  const waitingOnThem = pendingPairs.filter((p) => p.proposed_by_me);

  return (
    <div className="prt">
      <button type="button" className="prt-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="prt-head">
        <h1 className="prt-title">{t("הצמדים שלך")}</h1>
        <p className="prt-sub">
          {t("ב{sport} משחקים בזוגות, אז קודם צריך שותף. אפשר להיות בכמה צמדים במקביל — לכל אחד דירוג והיסטוריה משלו.", {
            sport: t(sportName || "פאדל"),
          })}
        </p>
      </div>

      {error && <p className="error prt-error">{t(error)}</p>}

      {waitingOnMe.length > 0 && (
        <section className="prt-section">
          <div className="prt-section-label" dir="ltr">
            {t("WAITING FOR YOU")}
          </div>
          {waitingOnMe.map((pair) => (
            <div className="prt-row prt-row--invite" key={pair.id}>
              <Avatar name={pair.partner.name} photoUrl={pair.partner.photo_url} size={44} />
              <div className="prt-row-body">
                <div className="prt-row-name">{pair.partner.name}</div>
                <div className="prt-row-meta">{t("הציע/ה להיות צמד")}</div>
              </div>
              <div className="prt-row-actions">
                <button
                  type="button"
                  className="prt-accept"
                  disabled={busyId === pair.id}
                  onClick={() => act(() => api.acceptPair(pair.id), pair.id)}
                >
                  {t("אישור")}
                </button>
                <button
                  type="button"
                  className="prt-decline"
                  disabled={busyId === pair.id}
                  onClick={() => act(() => api.declinePair(pair.id), pair.id)}
                >
                  {t("דחייה")}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="prt-section">
        <div className="prt-section-label" dir="ltr">
          {t("YOUR PAIRS")}
        </div>
        {loading && activePairs.length === 0 ? (
          <SkeletonBar width="100%" height={64} />
        ) : activePairs.length === 0 ? (
          <p className="prt-empty">{t("עוד אין לך צמד. בחר שותף מהרשימה למטה כדי להתחיל.")}</p>
        ) : (
          activePairs.map((pair) => (
            <div className="prt-row" key={pair.id}>
              <Avatar name={pair.partner.name} photoUrl={pair.partner.photo_url} size={44} />
              <div className="prt-row-body">
                <div className="prt-row-name">{pair.partner.name}</div>
                <div className="prt-row-meta" dir="ltr">
                  {[
                    levelLabel(pair.level, pair.provisional, t),
                    pair.matches_played === 1
                      ? t("משחק אחד")
                      : t("{n} משחקים", { n: pair.matches_played }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {waitingOnThem.length > 0 && (
        <section className="prt-section">
          <div className="prt-section-label" dir="ltr">
            {t("SENT")}
          </div>
          {waitingOnThem.map((pair) => (
            <div className="prt-row" key={pair.id}>
              <Avatar name={pair.partner.name} photoUrl={pair.partner.photo_url} size={44} />
              <div className="prt-row-body">
                <div className="prt-row-name">{pair.partner.name}</div>
                <div className="prt-row-meta">{t("ממתין לאישור")}</div>
              </div>
              <button
                type="button"
                className="prt-decline"
                disabled={busyId === pair.id}
                onClick={() => act(() => api.declinePair(pair.id), pair.id)}
              >
                {t("ביטול")}
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="prt-section">
        <div className="prt-section-label" dir="ltr">
          {t("INVITE SOMEONE")}
        </div>
        <p className="prt-invite-note">
          {t("השותף שלך עוד לא באפליקציה? שלח לו קישור — הוא ייכנס וכבר תהיו צמד.")}
        </p>
        <button type="button" className="prt-wa" disabled={sharing} onClick={shareInvite}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.17c-.25.69-1.45 1.33-2 1.37-.51.04-1.16.06-1.87-.12-.43-.11-.98-.33-1.7-.64-2.98-1.29-4.93-4.3-5.08-4.5-.15-.2-1.22-1.62-1.22-3.09 0-1.47.77-2.19 1.04-2.49.27-.3.59-.37.79-.37.2 0 .39 0 .57.01.18.01.43-.07.67.51.25.6.84 2.07.91 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.61.17.3.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.36 1.46.3.15.47.12.65-.07.17-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.03.97.3.15.5.22.57.35.07.12.07.72-.18 1.41z" />
          </svg>
          {sharing ? t("מכין קישור...") : t("הזמנה בוואטסאפ")}
        </button>
      </section>

      <section className="prt-section">
        <div className="prt-section-label" dir="ltr">
          {t("PLAYERS NEAR YOU")}
        </div>
        <div className="prt-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("חיפוש לפי שם")}
          />
        </div>
        {candidates === null ? (
          <SkeletonBar width="100%" height={64} />
        ) : candidates.length === 0 ? (
          <p className="prt-empty">
            {query
              ? t("לא נמצאו שחקנים בשם הזה")
              : t("אין כרגע שחקנים ברמה שלך באזור. אפשר לחפש לפי שם.")}
          </p>
        ) : (
          candidates.map((c) => (
            <div className="prt-row" key={c.user.id}>
              <Avatar name={c.user.name} photoUrl={c.user.photo_url} size={44} />
              <div className="prt-row-body">
                <div className="prt-row-name">{c.user.name}</div>
                <div className="prt-row-meta" dir={c.rated ? "ltr" : "auto"}>
                  {c.rated
                    ? [levelLabel(c.level, c.provisional, t), c.user.area]
                        .filter(Boolean)
                        .join(" · ")
                    : [t("עוד לא דירג/ה {sport}", { sport: t(sportName || "פאדל") }), c.user.area]
                        .filter(Boolean)
                        .join(" · ")}
                </div>
              </div>
              <button
                type="button"
                className="prt-ask"
                disabled={busyId === c.user.id}
                onClick={() => act(() => api.proposePair(selectedSportId, c.user.id), c.user.id)}
              >
                {busyId === c.user.id ? t("שולח...") : t("הצע צמד")}
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
