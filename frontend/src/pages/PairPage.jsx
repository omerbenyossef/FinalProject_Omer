import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { usePairs } from "../PairContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { formatSets, formatDayMonth, weekdayFull } from "../matchUtils.js";

/* A pair's own page.
   In padel the pair is what plays, so the rating, the record, the leagues and
   the matches belong to it rather than to either of its members — and this is
   the same page for both of them.

   Both personal levels sit at the top next to the pair's. A padel player has
   two numbers, and they move together: winning as a pair lifts the personal
   rating as well. Nowhere else in the app could you see them side by side.

   A player with more than one partner has more than one of these worlds, so
   the chips below the header switch between them. */

function levelText(level, provisional, t) {
  if (level == null) return "—";
  return `${level.toFixed(1)}${provisional ? ` · ${t("זמני")}` : ""}`;
}

export default function PairPage() {
  const { pairId } = useParams();
  const { user } = useAuth();
  const { activePairs, selectedPair, setSelectedPairId, reload: reloadPairs } = usePairs();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [pair, setPair] = useState(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setPair(null);
    api
      .pairDetail(pairId)
      .then(setPair)
      .catch((err) => setError(err.message));
  }, [pairId]);

  useEffect(load, [load]);

  // Opening a pair's world makes it the one the app speaks for, so the pair
  // named in the header is the pair on the screen. This is the same switch the
  // header's own picker makes.
  useEffect(() => {
    const id = Number(pairId);
    if (!Number.isNaN(id) && activePairs.some((p) => p.id === id) && selectedPair?.id !== id) {
      setSelectedPairId(id);
    }
  }, [pairId, activePairs, selectedPair, setSelectedPairId]);

  async function dissolve() {
    setBusy(true);
    try {
      await api.dissolvePair(pairId);
      await reloadPairs();
      navigate("/partners", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      setConfirming(false);
    }
  }

  if (error) return <p className="error">{t(error)}</p>;

  if (!pair) {
    return (
      <div className="pr">
        <div className="lgp-top">
          <Link to="/partners" className="lgp-back">
            <ChevronIcon aria-hidden="true" />
            {t("הצמדים שלך")}
          </Link>
        </div>
        <SkeletonBar width={220} height={38} style={{ margin: "18px" }} />
      </div>
    );
  }

  const me = pair.members.find((m) => m.id === user?.id);
  const partner = pair.members.find((m) => m.id !== user?.id);
  const others = activePairs.filter((p) => String(p.id) !== String(pairId));

  return (
    <div className="pr">
      <div className="lgp-top">
        <Link to="/partners" className="lgp-back">
          <ChevronIcon aria-hidden="true" />
          {t("הצמדים שלך")}
        </Link>
        <span className="lgp-sport">{t(pair.sport_name)}</span>
      </div>

      <header className="pr-head">
        <span className="pr-faces">
          {pair.members.map((m) => (
            <Avatar key={m.id} name={m.name} photoUrl={m.photo_url} size={44} />
          ))}
        </span>
        <h1 className="pr-title" dir="auto" style={{ unicodeBidi: "isolate" }}>
          {pair.label}
        </h1>
        <p className="pr-sub">
          {pair.matches_played === 1
            ? t("משחק אחד יחד")
            : t("{n} משחקים יחד", { n: pair.matches_played })}
          {" · "}
          <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
            {pair.wins}-{pair.losses}
          </span>
        </p>
      </header>

      {/* The three numbers, together: the pair's, and each player's own. */}
      <div className="pr-levels">
        <div className="pr-level pr-level--pair">
          <span className="pr-level-num" dir="ltr">
            {pair.level != null ? pair.level.toFixed(1) : "—"}
          </span>
          <span className="pr-level-label">{t("הצמד")}</span>
          {pair.provisional && <span className="pr-level-note">{t("זמני")}</span>}
        </div>
        {[me, partner].filter(Boolean).map((m) => (
          <div className="pr-level" key={m.id}>
            <span className="pr-level-num" dir="ltr">
              {m.level != null ? m.level.toFixed(1) : "—"}
            </span>
            <span className="pr-level-label" dir="auto" style={{ unicodeBidi: "isolate" }}>
              {m.id === user?.id ? t("את/ה") : m.name}
            </span>
            {m.provisional && <span className="pr-level-note">{t("זמני")}</span>}
          </div>
        ))}
      </div>
      <p className="pr-levels-note">
        {t("הרמה של הצמד היא שלכם יחד. הרמה האישית ממשיכה לזוז גם ממשחקים כצמד.")}
      </p>

      {/* More than one partner means more than one of these worlds. */}
      {others.length > 0 && (
        <div className="pr-switch">
          <span className="pr-switch-label">{t("צמדים נוספים שלך")}</span>
          <div className="pr-switch-chips">
            {others.map((p) => (
              <button
                type="button"
                key={p.id}
                className="pr-chip"
                onClick={() => navigate(`/pairs/${p.id}`)}
              >
                <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                  {p.partner.name}
                </span>
                {p.level != null && (
                  <span className="pr-chip-level" dir="ltr">
                    {p.level.toFixed(1)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {pair.leagues.length > 0 && (
        <section className="pr-section">
          <h2 className="pr-section-title">{t("הליגות של הצמד")}</h2>
          {pair.leagues.map((l) => (
            <Link to={`/leagues/${l.id}`} className="pr-row" key={l.id}>
              <span className="pr-row-body">
                <span className="pr-row-name" dir="auto" style={{ unicodeBidi: "isolate" }}>
                  {l.name}
                </span>
                <span className="pr-row-meta" dir="ltr">
                  {l.rank != null ? `#${l.rank} / ${l.teams}` : "—"} · {l.wins}-{l.losses}
                </span>
              </span>
              <ChevronIcon className="lg-row-chev" aria-hidden="true" />
            </Link>
          ))}
        </section>
      )}

      <section className="pr-section">
        <h2 className="pr-section-title">{t("המשחקים של הצמד")}</h2>
        {pair.matches.length === 0 ? (
          <p className="pr-empty">{t("עוד לא שיחקתם יחד.")}</p>
        ) : (
          pair.matches.map((m) => {
            const when = m.played_at || m.scheduled_at;
            return (
              <Link to={`/matches/${m.id}`} className="pr-row" key={m.id}>
                <span className="pr-row-body">
                  <span className="pr-row-name" dir="auto" style={{ unicodeBidi: "isolate" }}>
                    {t("מול {name}", { name: m.opponent_label })}
                  </span>
                  <span className="pr-row-meta">
                    {[
                      m.league_name || t("ידידותי"),
                      when
                        ? `${weekdayFull(new Date(when), t)} ${formatDayMonth(new Date(when))}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {m.won != null ? (
                  <span className={`pr-result${m.won ? " is-win" : ""}`} dir="ltr">
                    {m.won ? t("ניצחון") : t("הפסד")}
                    {m.sets?.length > 0 && (
                      <span className="pr-score" dir="ltr">
                        {formatSets(m.sets)}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="pr-pending">{t("עוד לא שוחק")}</span>
                )}
              </Link>
            );
          })
        )}
      </section>

      <div className="pr-foot">
        <button type="button" className="pr-dissolve" onClick={() => setConfirming(true)}>
          {t("פירוק הצמד")}
        </button>
      </div>

      {confirming && (
        <div className="sheet-backdrop" onClick={() => setConfirming(false)}>
          <div className="confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="confirm-sheet-handle" aria-hidden="true" />
            <div className="confirm-sheet-title">{t("לפרק את הצמד?")}</div>
            <p className="add-round-subtitle">
              {t("ההיסטוריה של הצמד נשמרת, אבל לא תוכלו להצטרף יחד לליגות חדשות.")}
            </p>
            <div className="add-round-actions">
              <button
                type="button"
                className="confirm-sheet-btn-confirm"
                onClick={dissolve}
                disabled={busy}
              >
                {t("פירוק הצמד")}
              </button>
              <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
