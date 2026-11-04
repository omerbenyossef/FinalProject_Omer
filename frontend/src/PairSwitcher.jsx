import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { usePairs } from "./PairContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { ChevronDownIcon } from "./Icons.jsx";

/* Which pair you are looking through — the whole app, not just this screen.
   The pair used to be a label that led to the pairs list: picking one changed
   almost nothing, so the choice wasn't worth a switcher. Now the selected pair
   is a lens on everything (diary, leagues, notifications, open items), which
   makes the switch worth showing — and makes it dangerous, because the other
   pair's match simply isn't on screen. So the button carries a dot whenever
   the pair you are NOT looking through has something waiting for you, and the
   sheet says what each pair is waiting on before you switch to it. */

function firstName(name) {
  return (name || "").trim().split(" ")[0];
}

function waitingLine(pair, t) {
  const n = pair.needs_you || 0;
  if (n === 0) return t("הכל מסודר");
  if (n === 1) return t("משהו אחד מחכה לך");
  return t("{n} דברים מחכים לך", { n });
}

export default function PairSwitcher() {
  const { activePairs, selectedPair, setSelectedPairId, pairsAwaitingMe } = usePairs();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!activePairs.length || !selectedPair) return null;

  // A dot means "something is waiting somewhere you can't see from here":
  // another pair of yours, or an invitation. The pair you are looking through
  // doesn't count — whatever it needs is already on the screen behind this.
  const elsewhere =
    pairsAwaitingMe.length > 0 ||
    activePairs.some((p) => p.id !== selectedPair.id && (p.needs_you || 0) > 0);

  function choose(id) {
    setSelectedPairId(id);
    setOpen(false);
  }

  const label = t("עם {name}", { name: firstName(selectedPair.partner?.name) });

  // With one pair there is nothing to switch to: a sheet that offers the one
  // thing already selected is a dead end, so the label stays what it was —
  // the way into that pair's screen.
  if (activePairs.length === 1) {
    return (
      <Link to={`/pairs/${selectedPair.id}`} className="wordmark-pair">
        <span className="wordmark-pair-label">{label}</span>
        {elsewhere && <span className="wordmark-pair-badge" aria-hidden="true" />}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className="wordmark-pair wordmark-pair--btn"
        onClick={() => setOpen(true)}
        aria-label={t("דרך איזה צמד?")}
      >
        <span className="wordmark-pair-label">{label}</span>
        <ChevronDownIcon className="wordmark-pair-chev" aria-hidden="true" />
        {elsewhere && <span className="wordmark-pair-badge" aria-hidden="true" />}
      </button>

      {/* To <body>: the topbar's backdrop-filter would otherwise make it the
          containing block and trap the sheet inside a 56px bar. */}
      {open &&
        createPortal(
          <div className="sportsheet-overlay" onClick={() => setOpen(false)}>
            <div
              className="sportsheet"
              role="dialog"
              aria-modal="true"
              aria-label={t("דרך איזה צמד?")}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="sportsheet-grab" aria-hidden="true" />
              <h2 className="sportsheet-title">{t("דרך איזה צמד?")}</h2>
              <p className="sportsheet-note">{t("מה שתבחרו כאן מסנן את כל האפליקציה")}</p>

              {activePairs.map((pair) => {
                const on = pair.id === selectedPair.id;
                return (
                  <button
                    type="button"
                    key={pair.id}
                    className={`sportrow${on ? " is-on" : ""}`}
                    onClick={() => choose(pair.id)}
                    aria-current={on ? "true" : undefined}
                  >
                    <span className="sportrow-badge">
                      <bdi>{(pair.partner?.name || "?").trim()[0]}</bdi>
                    </span>
                    <span className="sportrow-body">
                      <span className="sportrow-name">
                        <bdi>{pair.partner?.name}</bdi>
                      </span>
                      {/* The pair that needs you says so in the court's
                          colour: the same signal as the dot on the button,
                          read at the moment you choose. */}
                      <span
                        className={`sportrow-status${(pair.needs_you || 0) > 0 ? " is-waiting" : ""}`}
                      >
                        {waitingLine(pair, t)}
                      </span>
                    </span>
                    <span className={`sportrow-check${on ? " is-on" : ""}`} aria-hidden="true">
                      {on && (
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <polyline
                            points="6 12.5 10.5 17 18 8"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}

              <Link
                to={`/pairs/${selectedPair.id}`}
                className="sportsheet-more"
                onClick={() => setOpen(false)}
              >
                {t("לעמוד הצמד")}
              </Link>
              <Link to="/partners" className="sportsheet-more" onClick={() => setOpen(false)}>
                {t("כל הצמדים")}
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
