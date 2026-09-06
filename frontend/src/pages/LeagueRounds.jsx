import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { ChevronIcon } from "../Icons.jsx";
import { formatSets, roundDueDateObj } from "../matchUtils.js";
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

  const myCompleted = myMatches.filter((m) => m.status === "completed");
  const myWins = myCompleted.filter((m) => {
    const iAmPlayer1 = m.player1.id === user?.id;
    return iAmPlayer1 ? m.player1_score > m.player2_score : m.player2_score > m.player1_score;
  }).length;
  const myRecord = myCompleted.length > 0 ? `${myWins}W-${myCompleted.length - myWins}L` : null;

  return (
    <div>
      <header className="page-head">
        <Link to={`/leagues/${leagueId}`} className="back-link">
          <ChevronIcon aria-hidden="true" />
          <span dir="auto" style={{ unicodeBidi: "isolate" }}>{league.name}</span>
        </Link>
        <h1 className="rounds-title">{t("מחזורים")}</h1>
        <div className="rounds-summary">
          <span className="num">{roundNumbers.length}</span> {t("מחזורים")} ·{" "}
          <span className="num">{allMatches.length}</span> {t("משחקים")}
          {myRecord && (
            <>
              {" "}
              · {t("אתה")}{" "}
              <span className="num" dir="ltr">
                {myRecord}
              </span>
            </>
          )}
        </div>
      </header>

      {error && <p className="error">{t(error)}</p>}

      <div className="rounds-list">
        {roundNumbers.map((r) => {
          const isActive = r === activeRound;
          const roundMatches = grouped.get(r);
          const played = roundMatches.filter((m) => m.status !== "pending").length;
          const myMatch = myMatches.find((m) => m.round_number === r);
          const opponent = myMatch
            ? myMatch.player1.id === user?.id
              ? myMatch.player2
              : myMatch.player1
            : null;
          const iAmPlayer1 = myMatch && myMatch.player1.id === user?.id;
          const isCompleted = myMatch && myMatch.status === "completed";
          const iWon =
            isCompleted &&
            (iAmPlayer1
              ? myMatch.player1_score > myMatch.player2_score
              : myMatch.player2_score > myMatch.player1_score);
          const mySets = myMatch
            ? iAmPlayer1
              ? myMatch.sets
              : myMatch.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }))
            : null;
          const closesIn = isActive
            ? (() => {
                const due = roundDueDateObj(league.schedule_started_at, r, league.round_length_days);
                return due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
              })()
            : null;

          return (
            <Link to={`/leagues/${leagueId}/rounds/${r}`} key={r} className="round-row">
              <span className={`round-row-num${isActive ? " active" : ""}`} dir="ltr">
                {r}
              </span>
              <div className="round-row-body">
                <div className="round-row-name">{opponent ? opponent.name : "—"}</div>
                <div className="round-row-sub" dir="ltr">
                  {played}/{roundMatches.length} {t("שוחקו")}
                  {isActive && closesIn != null && ` · ${t("{n}d left", { n: closesIn })}`}
                </div>
              </div>
              {isActive ? (
                <span className="round-row-state">{t("לשחק")}</span>
              ) : isCompleted ? (
                <>
                  <span className="round-row-score" dir="ltr">
                    {formatSets(mySets)}
                  </span>
                  <span className={`round-row-badge${iWon ? " win" : ""}`}>{iWon ? "W" : "L"}</span>
                </>
              ) : null}
              <ChevronIcon className="round-row-chevron chevron-icon" aria-hidden="true" />
            </Link>
          );
        })}
      </div>

      {roundNumbers.length > 0 && <p className="rounds-hint">{t("הקשה על מחזור פותחת את כל המשחקים שלו")}</p>}
    </div>
  );
}
