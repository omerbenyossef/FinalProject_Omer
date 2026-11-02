import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Avatar from "../Avatar.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { usePairs } from "../PairContext.jsx";
import { SkeletonBar } from "../Skeleton.jsx";

/* Where a "be my partner" link lands. Same shape as the friendly-match invite
   screen, and for the same reason: a link is a question, and the person
   answering it may not have an account yet. The route is protected, so a
   stranger is sent to sign in and comes straight back here. */
export default function PairInvite() {
  const { token } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { reload } = usePairs();

  const [link, setLink] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getPairInviteLink(token)
      .then(setLink)
      .catch((err) => setError(err.message));
  }, [token]);

  async function accept() {
    setBusy(true);
    setError("");
    try {
      await api.redeemPairInviteLink(token);
      await reload();
      navigate("/partners", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (error && !link) {
    return (
      <div className="prt">
        <h1 className="prt-title">{t("הקישור לא תקין")}</h1>
        <p className="prt-sub">{t(error)}</p>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="prt">
        <SkeletonBar width={220} height={34} style={{ marginTop: 18 }} />
      </div>
    );
  }

  const spent = link.used || link.is_mine;

  return (
    <div className="prt prt--invite-screen">
      <div className="prt-invite-card">
        <Avatar name={link.inviter_name} photoUrl={link.inviter_photo_url} size={72} />
        <h1 className="prt-title">
          {t("{name} מזמין/ה אותך להיות צמד", { name: link.inviter_name })}
        </h1>
        <p className="prt-sub">
          {t("ב{sport} משחקים בזוגות. אם תאשר/י, תשחקו יחד כצמד — עם דירוג והיסטוריה משותפים.", {
            sport: t(link.sport_name),
          })}
        </p>

        {error && <p className="error prt-error">{t(error)}</p>}

        {link.is_mine ? (
          <p className="prt-empty">{t("זה הקישור שלך — שלח אותו למישהו אחר")}</p>
        ) : link.used ? (
          <p className="prt-empty">{t("ההזמנה הזו כבר נוצלה")}</p>
        ) : null}

        {!spent && (
          <button type="button" className="prt-accept prt-accept--big" disabled={busy} onClick={accept}>
            {busy ? t("מאשר...") : t("אישור — בואו נשחק")}
          </button>
        )}
      </div>
    </div>
  );
}
