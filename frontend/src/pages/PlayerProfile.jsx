import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useSport } from "../SportContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { SkeletonBar } from "../Skeleton.jsx";
import { formatSets } from "../matchUtils.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function joinedLabel(joinedAt) {
  const d = new Date(joinedAt);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function leagueCountLabel(n) {
  return `${n} LEAGUE${n === 1 ? "" : "S"}`;
}

export default function PlayerProfile() {
  const { playerId } = useParams();
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
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
    if (isSelf) return;
    setH2h(null);
    api
      .headToHead(numericPlayerId)
      .then(setH2h)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericPlayerId, isSelf]);

  if (error) return <p className="error">{t(error)}</p>;

  if (!profile) {
    return (
      <div>
        <div className="pp-nav">
          <button type="button" className="pp-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
            <ChevronIcon aria-hidden="true" />
          </button>
          <span className="pp-nav-label">{t("PLAYER")}</span>
        </div>
        <SkeletonBar width={180} height={38} style={{ marginTop: 18 }} />
        <SkeletonBar width={140} height={12} style={{ marginTop: 10 }} />
      </div>
    );
  }

  const neverPlayed = h2h && h2h.matches.length === 0;
  const recentMeetings = h2h ? h2h.matches.slice(0, 3) : [];
  const leadState = h2h && !neverPlayed ? (h2h.wins > h2h.losses ? "lead" : h2h.wins < h2h.losses ? "trail" : "even") : null;

  function goToChallenge() {
    navigate("/friendly/new", { state: { presetOpponent: { id: profile.id, name: profile.name } } });
  }

  return (
    <div className={isSelf ? "pp-page pp-self" : "pp-page"}>
      <div className="pp-nav">
        <button type="button" className="pp-nav-back" onClick={() => navigate(-1)} aria-label={t("חזרה")}>
          <ChevronIcon aria-hidden="true" />
        </button>
        <span className="pp-nav-label">{t("PLAYER")}</span>
      </div>

      <h1 className="pp-name">
        <span dir="auto" style={{ unicodeBidi: "isolate" }}>
          {profile.name}
        </span>
      </h1>
      <p className="pp-sub" dir="ltr">
        {leagueCountLabel(profile.league_count)} · JOINED {joinedLabel(profile.joined_at)}
      </p>

      <div className="pp-stats">
        <div className="pp-stat">
          <div className="pp-stat-num" dir="ltr">
            {profile.ntrp != null ? profile.ntrp.toFixed(1) : "—"}
          </div>
          <div className="pp-stat-label">{t("NTRP")}</div>
        </div>
        <div className="pp-stat">
          <div className="pp-stat-num" dir="ltr">
            {profile.rank != null ? (
              <>
                {profile.rank}
                <span className="pp-stat-of">/{profile.total_players}</span>
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="pp-stat-label">{profile.rank != null ? t("RANK") : t("UNRANKED")}</div>
        </div>
        <div className="pp-stat">
          <div className="pp-stat-num" dir="ltr">
            {profile.wins}-{profile.losses}
          </div>
          <div className="pp-stat-label">{t("RECORD")}</div>
        </div>
        <div className="pp-stat">
          <div className={`pp-stat-num${profile.streak > 0 && !profile.streak_won ? " dim" : ""}`} dir="ltr">
            {profile.streak > 0 ? `${profile.streak_won ? "W" : "L"}${profile.streak}` : "—"}
          </div>
          <div className="pp-stat-label">{t("STREAK")}</div>
        </div>
      </div>

      {!isSelf &&
        (neverPlayed ? (
          <p className="pp-never-played">{t("NEVER PLAYED")}</p>
        ) : h2h ? (
          <>
            <div className="pp-h2h">
              <div className="pp-h2h-label">{t("HEAD TO HEAD")}</div>
              <div className="pp-h2h-row">
                <span className="pp-h2h-score" dir="ltr">
                  {h2h.wins}-{h2h.losses}
                </span>
                <span className={`pp-h2h-lead${leadState === "lead" ? " lime" : ""}`}>
                  {leadState === "lead" ? t("YOU LEAD") : leadState === "trail" ? t("HE LEADS") : t("EVEN")}
                </span>
              </div>
            </div>

            <div className="pp-meetings">
              <div className="pp-meetings-label">{t("LAST MEETINGS")}</div>
              {recentMeetings.map((m) => {
                const iWon = m.my_score > m.opponent_score;
                const context = m.kind === "friendly" ? "Friendly" : `${m.league_name} · R${m.round_number}`;
                return (
                  <div className="pp-meeting-row" key={m.id}>
                    <span className={`pp-meeting-badge${iWon ? " win" : " loss"}`}>{iWon ? "W" : "L"}</span>
                    <span className="pp-meeting-context">
                      {m.kind === "friendly" ? (
                        context
                      ) : (
                        <>
                          <span dir="auto" style={{ unicodeBidi: "isolate" }}>{m.league_name}</span> · R{m.round_number}
                        </>
                      )}
                    </span>
                    <span className="pp-meeting-score" dir="ltr">
                      {formatSets(iWon ? m.sets : m.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games })))}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : null)}

      {!isSelf && profile.shared_leagues.length > 0 && (
        <div className="pp-shared">
          <div className="pp-shared-label">{t("SHARED LEAGUES")}</div>
          {profile.shared_leagues.map((l) => (
            <div className="pp-shared-row" key={l.id}>
              <span className="pp-shared-name">
                <span dir="auto" style={{ unicodeBidi: "isolate" }}>
                  {l.name}
                </span>
              </span>
              <span className="pp-shared-ranks" dir="ltr">
                YOU {l.my_rank != null ? `#${l.my_rank}` : "—"} · HIM {l.opponent_rank != null ? `#${l.opponent_rank}` : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {!isSelf && (
        <button type="button" className="pp-challenge" onClick={goToChallenge}>
          <span className="pp-dot-lime" aria-hidden="true" />
          <span className="pp-challenge-label">{t("הזמן למשחק חברות")}</span>
          <ChevronIcon aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
