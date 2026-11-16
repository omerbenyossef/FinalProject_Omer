import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import Avatar from "../Avatar.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { tintColor } from "../tint.js";
import { monthName } from "../matchUtils.js";

/* 220b — somebody else's page.

   It used to be a column of mono headings — PLAYER, HEAD TO HEAD, LAST
   MEETINGS, SHARED LEAGUES — above numbers with no sentence around them.
   This says the same things as a page about a person: who they are, how
   they have done, every time the two of you have met, and where you both
   stand in the leagues you share. */

// The shared month labels are stored in capitals for the screens that set
// them in mono. In a sentence they are just shouting.
function sentenceCase(label) {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

// "1st" reads as a placing in English; Hebrew has no ordinal suffix to glue
// to a digit, so there it stays a number.
function place(rank, language) {
  if (rank == null) return "—";
  if (language !== "en") return String(rank);
  const teens = rank % 100;
  const suffix = teens >= 11 && teens <= 13 ? "th" : ["th", "st", "nd", "rd"][rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "";
}

export default function PlayerProfile() {
  const { playerId } = useParams();
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [h2h, setH2h] = useState(null);
  const [error, setError] = useState("");

  const numericPlayerId = Number(playerId);
  const isSelf = user && numericPlayerId === user.id;

  useEffect(() => {
    if (!selectedSportId) return;
    setProfile(null);
    setError("");
    api
      .playerProfile(numericPlayerId, selectedSportId)
      .then(setProfile)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericPlayerId, selectedSportId]);

  useEffect(() => {
    setH2h(null);
    api
      .headToHead(numericPlayerId)
      .then(setH2h)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericPlayerId]);

  // my-profile-171a: my own profile is its own screen, so this one is only
  // ever about somebody else.
  if (isSelf) return <Navigate to="/me" replace />;

  const back = (
    <div className="pv-top">
      <button
        type="button"
        className="pv-back"
        onClick={() => navigate(-1)}
        aria-label={t("חזרה")}
      >
        <ChevronIcon aria-hidden="true" />
      </button>
    </div>
  );

  if (error) return <p className="error">{t(error)}</p>;

  if (!profile) {
    return (
      <div className="pv">
        {back}
        <SkeletonBar width={180} height={38} />
        <SkeletonBar width={140} height={12} />
      </div>
    );
  }

  const first = firstName(profile.name);
  const joined = new Date(profile.joined_at);
  const meetings = h2h?.matches ?? [];
  const record = `${profile.wins}–${profile.losses}`;
  const streak =
    profile.streak > 0 && profile.streak_won != null
      ? profile.streak_won
        ? profile.streak === 1
          ? t("{n} ניצחון", { n: 1 })
          : t("{n} ניצחונות", { n: profile.streak })
        : profile.streak === 1
          ? t("{n} הפסד", { n: 1 })
          : t("{n} הפסדים", { n: profile.streak })
      : "—";

  const stats = [
    { value: profile.ntrp != null ? profile.ntrp.toFixed(1) : "—", label: t("NTRP") },
    { value: profile.rank != null ? `#${profile.rank}` : "—", label: t("דירוג") },
    { value: record, label: t("מאזן") },
    { value: streak, label: t("רצף"), words: true },
  ];

  return (
    <div className="pv">
      {back}

      <header className="pv-head">
        <Avatar
          name={profile.name}
          photoUrl={profile.photo_url}
          size={60}
          background={tintColor(profile.name)}
          color="#0e1116"
          fontSize={24}
        />
        <div className="pv-id">
          <h1 className="pv-name" dir="auto">
            {profile.name}
          </h1>
          <span className="pv-sub" dir="auto">
            {[
              profile.league_count === 1
                ? t("ליגה אחת")
                : t("{n} ליגות", { n: profile.league_count }),
              t("הצטרף ב-{month} {year}", {
                month: sentenceCase(monthName(joined, t)),
                year: joined.getFullYear(),
              }),
            ].join(" · ")}
          </span>
        </div>
      </header>

      <div className="pv-stats">
        {stats.map((stat) => (
          <div className={`pv-stat${stat.words ? " pv-stat--words" : ""}`} key={stat.label}>
            <span className="pv-stat-value" dir="auto">
              {stat.value}
            </span>
            <span className="pv-stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      {meetings.length > 0 && (
        <section className="pv-sec">
          <h2 className="pv-sec-title">
            {t("משחקים מול")} <bdi>{first}</bdi>
          </h2>
          <div className="pv-card">
            {meetings.map((m) => {
              const iWon = m.my_score > m.opponent_score;
              const at = m.played_at ? new Date(m.played_at) : null;
              // One set reads as the score people remember ("6–4"); more
              // than one would not fit, so those say how the match went.
              const score =
                m.sets?.length === 1
                  ? `${m.sets[0].player1_games}–${m.sets[0].player2_games}`
                  : `${m.my_score}–${m.opponent_score}`;
              return (
                <div className="pv-row" key={m.id}>
                  <span className={`pv-badge${iWon ? " is-win" : " is-loss"}`}>
                    {sentenceCase(iWon ? t("ניצחון") : t("הפסד"))}
                  </span>
                  <span className="pv-row-text">
                    <span className="pv-row-when" dir="auto">
                      {at ? `${at.getDate()} ${sentenceCase(monthName(at, t))}` : t("ידידותי")}
                    </span>
                    <span className="pv-row-sub" dir="auto">
                      {m.kind === "friendly"
                        ? t("ידידותי")
                        : [
                            m.league_name,
                            m.round_number
                              ? sentenceCase(t("מחזור {n}", { n: m.round_number }))
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                  </span>
                  <span className="pv-score" dir="ltr">
                    {score}
                  </span>
                </div>
              );
            })}
            <div className="pv-total">
              <span className="pv-total-label">{t("סך הכול")}</span>
              <span className="pv-total-value">
                <b>{h2h.wins}</b>
                {` ${h2h.wins === 1 ? t("ניצחון") : t("ניצחונות")} · ${h2h.losses} ${
                  h2h.losses === 1 ? t("הפסד") : t("הפסדים")
                }`}
              </span>
            </div>
          </div>
        </section>
      )}

      {profile.shared_leagues.length > 0 && (
        <section className="pv-sec">
          <h2 className="pv-sec-title">{t("ליגות משותפות")}</h2>
          <div className="pv-card">
            {profile.shared_leagues.map((league) => (
              <button
                type="button"
                className="pv-league"
                key={league.id}
                onClick={() => navigate(`/leagues/${league.id}`)}
              >
                <span className="pv-league-name" dir="auto">
                  {league.name}
                </span>
                <span className="pv-league-ranks">
                  {`${sentenceCase(t("אתה"))} `}
                  <b>{place(league.my_rank, language)}</b>
                  {" · "}
                  <bdi>{first}</bdi>{" "}
                  <b>{place(league.opponent_rank, language)}</b>
                </span>
                <ChevronIcon className="pv-chev" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        className="pv-invite"
        onClick={() =>
          navigate("/friendly/new", {
            state: { presetOpponent: { id: profile.id, name: profile.name } },
          })
        }
      >
        {t("הזמן למשחק ידידותי")}
      </button>
    </div>
  );
}
