import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { SkeletonBar } from "../Skeleton.jsx";

/* Where a friendly invite link lands. It used to point straight at /signup,
   which meant three different people got the same wrong screen: a friend who
   already has an account was pushed into making a second one, and the sender
   themselves could open their own link, register again, and end up with a
   match against themselves. A link is a question — "will you play me?" — so
   it opens on the question, and the answer needs an account, not a new one. */
export default function FriendlyInvite() {
  const { token } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [link, setLink] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getFriendlyInviteLink(token)
      .then(setLink)
      .catch((err) => setError(err.message));
  }, [token]);

  async function handleAccept() {
    setBusy(true);
    setError("");
    try {
      const match = await api.redeemFriendlyInviteLink(token);
      // Accepted, but with no time yet — same as any other friendly, so it
      // goes on to the one question that's left.
      navigate(`/matches/${match.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (error && !link) {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <span className="sched-nav-label">{t("INVITE")}</span>
        </div>
        <h1 className="lp-name">{t("הקישור הזה לא תקין")}</h1>
        <p className="lp-meta">{t("אפשר לבקש מהחבר/ה לשלוח קישור חדש.")}</p>
        <button type="button" className="lp-join-btn" onClick={() => navigate("/leagues", { replace: true })}>
          {t("לעמוד הליגות")}
        </button>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <span className="sched-nav-label">{t("INVITE")}</span>
        </div>
        <SkeletonBar width={220} height={38} style={{ marginTop: 18 }} />
      </div>
    );
  }

  // Your own link. The only useful thing to say is who it's for.
  if (link.is_mine) {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <span className="sched-nav-label">{t("INVITE")}</span>
        </div>
        <h1 className="lp-name">{t("זה הקישור שלך")}</h1>
        <p className="lp-meta">{t("שלח אותו למי שאתה רוצה לשחק נגדו — אי אפשר לשחק נגד עצמך.")}</p>
        <button type="button" className="lp-join-btn" onClick={() => navigate("/friendly/new", { replace: true })}>
          {t("חזרה למשחק ידידותי")}
        </button>
      </div>
    );
  }

  if (link.used) {
    return (
      <div className="sched-page">
        <div className="sched-nav">
          <span className="sched-nav-label">{t("INVITE")}</span>
        </div>
        <h1 className="lp-name">{t("הקישור הזה כבר נוצל")}</h1>
        <p className="lp-meta">
          {t("{name} כבר קבע/ה משחק דרך הקישור הזה. אפשר לבקש קישור חדש.", { name: link.inviter_name })}
        </p>
        <button type="button" className="lp-join-btn" onClick={() => navigate("/leagues", { replace: true })}>
          {t("לעמוד הליגות")}
        </button>
      </div>
    );
  }

  return (
    <div className="sched-page">
      <div className="sched-nav">
        <span className="sched-nav-label">{t("INVITE")}</span>
      </div>

      {link.inviter_photo_url && (
        <div className="pp-photo">
          <Avatar name={link.inviter_name} photoUrl={link.inviter_photo_url} size={72} />
        </div>
      )}

      <h1 className="lp-name" dir="rtl">
        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
          {t("{name} מזמין/ה אותך למשחק", { name: link.inviter_name })}
        </span>
      </h1>
      <p className="lp-meta">
        {t("{sport} · משחק ידידותי. הוא נספר בדירוג האישי שלכם ולא משפיע על טבלאות ליגה.", {
          sport: link.sport_name,
        })}
      </p>

      {error && <p className="error">{t(error)}</p>}

      <button type="button" className="lp-join-btn" onClick={handleAccept} disabled={busy}>
        {busy ? t("מאשר...") : t("מקבל את ההזמנה")}
      </button>
      <button
        type="button"
        className="btn-secondary btn-small"
        style={{ marginTop: 12 }}
        onClick={() => navigate("/leagues", { replace: true })}
        disabled={busy}
      >
        {t("לא עכשיו")}
      </button>
    </div>
  );
}
