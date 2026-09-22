import { useState } from "react";
import { api } from "./api";
import { useLanguage } from "./LanguageContext.jsx";
import BookCourtLink from "./BookCourtLink.jsx";

/* What the court cost, and where the two of them are on settling it.
   The app never moves money — Bit does that in ten seconds and everyone
   already has it. What it does is remember the number and who is owed, which
   is the part people actually find awkward. */

function money(value) {
  // No trailing ".00" on a round number, two places when there are agorot.
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default function MatchCost({ detail, matchId, me, onChanged }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cost = detail.court_cost;
  const share = detail.my_share;
  const iBooked = detail.booked_by === me;
  const settled = !!detail.cost_settled_at;
  const claimed = !!detail.cost_claimed_at;

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setEditing(false);
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (editing || cost == null) {
    return (
      <div className="mc">
        <div className="mc-head">{t("עלות המגרש")}</div>
        {cost == null && !editing ? (
          <>
            <p className="mc-sub">{t("מי שהזמין יכול לרשום כמה זה עלה, וכמה מגיע לו בחזרה.")}</p>
            <div className="mc-actions">
              <BookCourtLink className="mc-ghost">{t("הזמן מגרש")}</BookCourtLink>
              <button type="button" className="mc-ghost" onClick={() => setEditing(true)}>
                {t("הזמנתי — רשום עלות")}
              </button>
            </div>
          </>
        ) : (
          <form
            className="mc-form"
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(amount);
              if (!value || value <= 0) return;
              run(() => api.setMatchCost(matchId, value));
            }}
          >
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("סכום בשקלים")}
              aria-label={t("סכום בשקלים")}
              autoFocus
            />
            <button type="submit" className="mc-go" disabled={busy || !Number(amount)}>
              {busy ? t("שומר...") : t("שמור")}
            </button>
            <button type="button" className="mc-cancel" onClick={() => setEditing(false)}>
              {t("ביטול")}
            </button>
          </form>
        )}
        {error && <p className="mc-error error">{t(error)}</p>}
      </div>
    );
  }

  return (
    <div className="mc">
      <div className="mc-head">{t("עלות המגרש")}</div>
      <div className="mc-total" dir="ltr">
        <span className="mc-total-num">{money(cost)} ₪</span>
        <span className="mc-total-share">
          {iBooked
            ? t("חלקו: {n} ₪", { n: money(share) })
            : t("חלקך: {n} ₪", { n: money(share) })}
        </span>
      </div>

      {settled ? (
        <p className="mc-state is-done">{t("סגור ביניכם")}</p>
      ) : iBooked ? (
        <>
          <p className="mc-state">
            {claimed ? t("סימנו שהעבירו לך. קיבלת?") : t("מחכה שיעבירו לך")}
          </p>
          <div className="mc-actions">
            {claimed && (
              <button
                type="button"
                className="mc-go"
                disabled={busy}
                onClick={() => run(() => api.settleMatchCost(matchId))}
              >
                {t("קיבלתי")}
              </button>
            )}
            <button type="button" className="mc-ghost" onClick={() => setEditing(true)}>
              {t("שינוי הסכום")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mc-state">
            {claimed ? t("סימנת שהעברת. מחכה לאישור שלו.") : t("צריך להעביר את חלקך")}
          </p>
          {!claimed && (
            <div className="mc-actions">
              <button
                type="button"
                className="mc-go"
                disabled={busy}
                onClick={() => run(() => api.claimMatchCost(matchId))}
              >
                {t("העברתי")}
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="mc-error error">{t(error)}</p>}
    </div>
  );
}
