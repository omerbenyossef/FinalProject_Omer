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
                <div className="prt-row-meta" dir="ltr">
                  {[levelLabel(c.level, c.provisional, t), c.user.area]
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
