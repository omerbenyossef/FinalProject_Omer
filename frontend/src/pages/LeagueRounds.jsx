import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { formatSets, roundDueDate } from "../matchUtils.js";
import { SkeletonPageHeader } from "../Skeleton.jsx";

function groupMatchesByRound(matches) {
  const groups = new Map();
  for (const match of matches) {
    const key = match.round_number ?? "none";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  return groups;
}

export default function LeagueRounds() {
  const { leagueId } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [league, setLeague] = useState(null);
  const [allMatches, setAllMatches] = useState([]);
  const [myMatches, setMyMatches] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [leagueData, allMatchesData, myMatchesData] = await Promise.all([
          api.getLeague(leagueId),
          api.listAllMatches(leagueId),
          api.listMatches(leagueId),
        ]);
        setLeague(leagueData);
        setAllMatches(allMatchesData);
        setMyMatches(myMatchesData);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, [leagueId]);

  if (!league) {
    return (
      <div>
        <SkeletonPageHeader />
      </div>
    );
  }

  const grouped = groupMatchesByRound(allMatches);
  const roundNumbers = [...grouped.keys()].filter((r) => r !== "none").sort((a, b) => b - a);
  const activeRound = roundNumbers.length > 0 ? Math.max(...roundNumbers) : null;

  return (
    <div>
      <header className="page-head">
        <Link to={`/leagues/${leagueId}`} className="back-link">
          <ChevronIcon aria-hidden="true" />
          {league.name}
        </Link>
        <div className="page-title-row">
          <h1>{t("מחזורים")}</h1>
        </div>
        <div className="league-detail-meta">
          {t("{n} מחזורים · {m} משחקים", { n: roundNumbers.length, m: allMatches.length })}
        </div>
      </header>

      {error && <p className="error">{t(error)}</p>}

      <div className="rank-row-list">
        {roundNumbers.map((r) => {
          const roundMatches = grouped.get(r);
          const isActive = r === activeRound;
          const myMatch = myMatches.find((m) => m.round_number === r);
          const opponent = myMatch
            ? myMatch.player1.id === user?.id
              ? myMatch.player2
              : myMatch.player1
            : null;
          const iAmPlayer1 = myMatch && myMatch.player1.id === user?.id;
          const isCompleted = myMatch && myMatch.status === "completed";
          const iWon = isCompleted && (iAmPlayer1 ? myMatch.player1_score > myMatch.player2_score : myMatch.player2_score > myMatch.player1_score);
          const mySets = myMatch
            ? iAmPlayer1
              ? myMatch.sets
              : myMatch.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }))
            : null;
          const closesDate = isActive
            ? roundDueDate(league.schedule_started_at, r, league.round_length_days)
            : "";

          return (
            <Link to={`/leagues/${leagueId}/rounds/${r}`} key={r} className="rank-row round-list-row">
              <span className={`rank-row-number${isActive ? " top" : ""}`} dir="ltr">
                {r}
              </span>
              <div className="rank-row-body">
                <div className="round-list-top">
                  <div className="round-list-info">
                    {isActive ? (
                      <>
                        <span className="round-list-label active">{t("פעיל עכשיו")}</span>
                        {closesDate && (
                          <span className="round-list-sub">
                            {t("נסגר ב-{date}", { date: closesDate })}
                          </span>
                        )}
                      </>
                    ) : myMatch ? (
                      <>
                        <span className="round-list-label">{t("מול {name}", { name: opponent.name })}</span>
                        {isCompleted && (
                          <span className="round-list-sub" dir="ltr">
                            {formatSets(mySets)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="round-list-label muted">
                        {t("{n} משחקים", { n: roundMatches.length })}
                      </span>
                    )}
                  </div>
                  {isActive ? (
                    <span className="round-list-badge">{t("לשחק")}</span>
                  ) : isCompleted ? (
                    <span className={`match-result-badge ${iWon ? "win" : "loss"}`}>{iWon ? "W" : "L"}</span>
                  ) : null}
                </div>
                <div className="profile-form-strip round-list-strip">
                  {roundMatches.map((m, i) => (
                    <span key={i} className={`profile-form-bar${m.status !== "pending" ? " win" : ""}`} />
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {roundNumbers.length > 0 && (
        <p className="rounds-list-hint">{t("הקשה על מחזור פותחת את כל המשחקים שלו")}</p>
      )}
    </div>
  );
}
