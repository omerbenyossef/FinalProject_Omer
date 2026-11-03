import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import { usePairs } from "../PairContext.jsx";
import { SkeletonBar } from "../Skeleton.jsx";

/* Where a league invite link lands. The token in the URL is the whole of the
   invitation — the league's id authorises nothing, which is the point of
   having replaced the join code with this. The route is protected, so
   somebody with no account signs in and comes straight back to the question. */
export default function LeagueInvite() {
  const { token } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { activePairs, selectedPair } = usePairs();

  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getLeagueInviteLink(token)
      .then((data) => {
        // Already in it: there is no question to ask, so go to the league.
        if (data.is_member) {
          navigate(`/leagues/${data.league_id}`, { replace: true });
          return;
        }
        setInfo(data);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const needsPartner = Boolean(info?.is_doubles) && activePairs.length === 0;
  const joiningPair = info?.is_doubles
    ? activePairs.find((p) => p.id === selectedPair?.id) ?? activePairs[0] ?? null
    : null;

  async function accept() {
    if (needsPartner) {
      navigate("/partners");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.redeemLeagueInviteLink(token, joiningPair?.id ?? null);
      navigate(`/leagues/${info.league_id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (error && !info) {
    return (
      <div className="prt">
        <h1 className="prt-title">{t("הקישור לא תקין")}</h1>
        <p className="prt-sub">{t(error)}</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="prt">
        <SkeletonBar width={220} height={34} style={{ marginTop: 18 }} />
      </div>
    );
  }

  const spots = info.capacity != null ? Math.max(0, info.capacity - info.joined) : null;

  return (
    <div className="prt prt--invite-screen">
      <div className="prt-invite-card">
        <div className="prt-section-label" dir="ltr">
          {t("הזמנה לליגה")}
        </div>
        <h1 className="prt-title">{info.league_name}</h1>
        <p className="prt-sub">
          {info.inviter_name
            ? t("{name} מזמין/ה אותך לליגה הזו.", { name: info.inviter_name })
            : t("הוזמנת לליגה הזו.")}
        </p>

        <div className="prt-invite-facts" dir="ltr">
          <span>{t(info.sport_name)}</span>
          <span aria-hidden="true">·</span>
          <span>
            NTRP {info.level_min.toFixed(1)}–{info.level_max.toFixed(1)}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {info.is_doubles
              ? t("{n} צמדים", { n: info.joined })
              : t("{n} שחקנים", { n: info.joined })}
          </span>
        </div>

        {spots != null && spots > 0 && (
          <p className="prt-sub">
            {spots === 1
              ? t("מקום פנוי אחד מתוך {capacity}", { capacity: info.capacity })
              : t("{open} מקומות פנויים מתוך {capacity}", { open: spots, capacity: info.capacity })}
          </p>
        )}

        {needsPartner && (
          <p className="prt-sub">
            {t("זאת ליגת זוגות — כדי להצטרף צריך שותף. אפשר לראות הכול כאן, ולחזור אחרי שתמצא אחד.")}
          </p>
        )}
        {!needsPartner && joiningPair && (
          <p className="prt-sub">{t("תצטרפו כצמד עם {name}", { name: joiningPair.partner.name })}</p>
        )}

        {error && <p className="error prt-error">{t(error)}</p>}

        {info.revoked ? (
          <p className="prt-empty">{t("קישור ההזמנה כבר לא בתוקף")}</p>
        ) : info.is_full ? (
          <p className="prt-empty">{t("הליגה מלאה")}</p>
        ) : (
          <button type="button" className="prt-accept prt-accept--big" disabled={busy} onClick={accept}>
            {needsPartner ? t("צריך שותף") : busy ? t("מצטרף...") : t("הצטרף לליגה")}
          </button>
        )}
      </div>
    </div>
  );
}
