import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";

/* The two players' conversation about one match. No websockets in this stack,
   so it polls while the screen is open and stops the moment it isn't — a tab
   left open in a pocket shouldn't keep asking. */

const POLL_MS = 6000;

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dayKey(date) {
  return date.toDateString();
}

function dayLabel(date, t) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (dayKey(date) === dayKey(today)) return t("היום");
  if (dayKey(date) === dayKey(yesterday)) return t("אתמול");
  return `${date.getDate()}.${date.getMonth() + 1}`;
}

export default function MatchChat() {
  const { matchId } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [chat, setChat] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);
  // Only scroll to the newest message when there is a newer one, so a poll
  // doesn't yank the view while someone is reading back.
  const lastIdRef = useRef(null);

  const load = useCallback(
    (quiet) => {
      api
        .getMatchChat(matchId)
        .then(setChat)
        .catch((err) => {
          if (!quiet) setError(err.message);
        });
    },
    [matchId]
  );

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const newest = chat?.messages?.length ? chat.messages[chat.messages.length - 1].id : null;
    if (newest !== lastIdRef.current) {
      lastIdRef.current = newest;
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [chat]);

  async function handleSend(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      await api.sendMatchMessage(matchId, body);
      setDraft("");
      load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (error && !chat) {
    return (
      <div className="chat">
        <div className="chat-head">
          <button type="button" className="chat-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
        </div>
        <p className="error">{t(error)}</p>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="chat">
        <div className="chat-head">
          <button type="button" className="chat-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
        </div>
        <SkeletonBar width={200} height={28} style={{ marginTop: 18 }} />
      </div>
    );
  }

  let lastDay = null;
  let lastSender = null;

  return (
    <div className="chat">
      <div className="chat-head">
        <button type="button" className="chat-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          className="chat-who"
          onClick={() => navigate(`/players/${chat.opponent.id}`)}
        >
          <Avatar name={chat.opponent.name} photoUrl={chat.opponent.photo_url} size={32} />
          <span className="chat-who-name" dir="auto" style={{ unicodeBidi: "isolate" }}>
            {chat.opponent.name}
          </span>
        </button>
      </div>

      <div className="chat-scroll">
        {chat.messages.length === 0 && (
          <p className="chat-empty">
            {t("אין עדיין הודעות. אפשר לכתוב מתי נוח, איפה משחקים, או שאתם בדרך.")}
          </p>
        )}

        {chat.messages.map((m) => {
          const at = new Date(m.created_at);
          const day = dayKey(at);
          const showDay = day !== lastDay;
          // Consecutive lines from the same person on the same day read as one
          // turn in the conversation, so only the first of them is labelled.
          const showWho = showDay || m.sender_id !== lastSender;
          lastDay = day;
          lastSender = m.sender_id;
          return (
            <div key={m.id}>
              {showDay && <div className="chat-day">{dayLabel(at, t)}</div>}
              <div className={`chat-line${m.mine ? " is-mine" : ""}${showWho ? " is-first" : ""}`}>
                <div className="chat-bubble">
                  <span className="chat-body" dir="auto">
                    {m.body}
                  </span>
                  <span className="chat-time" dir="ltr">
                    {hhmm(at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="chat-error error">{t(error)}</p>}

      {chat.can_send ? (
        <form className="chat-compose" onSubmit={handleSend}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("הודעה")}
            aria-label={t("הודעה")}
          />
          <button type="submit" className="chat-send" disabled={sending || !draft.trim()}>
            {t("שלח")}
          </button>
        </form>
      ) : (
        <p className="chat-closed">{t("המשחק נסגר, והצ'אט איתו. ההודעות נשמרו.")}</p>
      )}
    </div>
  );
}
