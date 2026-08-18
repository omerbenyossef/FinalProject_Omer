import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import {
  formatDayMonthTime,
  formatSets,
  daysLeftLabel,
  matchScheduleState,
  roundDueDateObj,
} from "./matchUtils.js";

const OpenActionContext = createContext(null);

function sortEarliest(entries) {
  return [...entries].sort((a, b) => {
    const rA = a.match.round_number ?? Infinity;
    const rB = b.match.round_number ?? Infinity;
    if (rA !== rB) return rA - rB;
    const sA = a.schedule_started_at ? new Date(a.schedule_started_at).getTime() : Infinity;
    const sB = b.schedule_started_at ? new Date(b.schedule_started_at).getTime() : Infinity;
    return sA - sB;
  });
}

export function OpenActionProvider({ children }) {
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [nextMatches, setNextMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [barSheetOpen, setBarSheetOpen] = useState(false);
  const [barBusy, setBarBusy] = useState(false);

  function reload() {
    if (!user) return;
    api
      .myNextMatches()
      .then(setNextMatches)
      .catch(() => {})
      .finally(() => setMatchesLoading(false));
  }

  useEffect(() => {
    if (!user) {
      setNextMatches([]);
      setMatchesLoading(false);
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const currentLeagueId = useMemo(() => {
    const m = location.pathname.match(/^\/leagues\/(\d+)/);
    return m ? Number(m[1]) : null;
  }, [location.pathname]);

  const relevantEntries = useMemo(
    () => nextMatches.filter((entry) => entry.sport_id === selectedSportId),
    [nextMatches, selectedSportId]
  );

  const confirmCandidates = useMemo(
    () =>
      user
        ? relevantEntries.filter(
            (e) => e.match.status === "pending_confirmation" && e.match.reported_by !== user.id
          )
        : [],
    [relevantEntries, user]
  );

  const reportCandidates = useMemo(
    () =>
      user
        ? relevantEntries.filter(
            (e) => e.match.status === "pending" && matchScheduleState(e.match, user.id) === "ready"
          )
        : [],
    [relevantEntries, user]
  );

  const proposedCandidates = useMemo(
    () =>
      user
        ? relevantEntries.filter(
            (e) =>
              e.match.status === "pending" && matchScheduleState(e.match, user.id) === "proposed_by_them"
          )
        : [],
    [relevantEntries, user]
  );

  const openAction = useMemo(() => {
    if (!user) return null;

    if (confirmCandidates.length > 0) {
      const entry = sortEarliest(confirmCandidates)[0];
      const m = entry.match;
      const iAmPlayer1 = m.player1.id === user.id;
      const reporter = m.reported_by === m.player1.id ? m.player1 : m.player2;
      const mySets = iAmPlayer1
        ? m.sets
        : m.sets?.map((s) => ({ player1_games: s.player2_games, player2_games: s.player1_games }));
      return {
        kind: "confirm",
        entry,
        match: m,
        lime: true,
        title: t("אשר {score}", { score: formatSets(mySets) }),
        subParts: [reporter.name, m.round_number ? t("מחזור {n}", { n: m.round_number }) : "FRIENDLY"],
      };
    }

    if (reportCandidates.length > 0) {
      const entry = sortEarliest(reportCandidates)[0];
      const m = entry.match;
      const opponent = m.player1.id === user.id ? m.player2 : m.player1;
      const due = roundDueDateObj(entry.schedule_started_at, m.round_number, 7);
      const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
      const subParts = [
        m.round_number ? t("מחזור {n}", { n: m.round_number }) : null,
        daysLeft !== null ? daysLeftLabel(daysLeft) : null,
      ].filter(Boolean);
      return {
        kind: "report",
        entry,
        match: m,
        lime: true,
        title: t("דווח מול {name}", { name: opponent.name }),
        subParts,
      };
    }

    if (proposedCandidates.length > 0) {
      const entry = sortEarliest(proposedCandidates)[0];
      const m = entry.match;
      const opponent = m.player1.id === user.id ? m.player2 : m.player1;
      return {
        kind: "schedule",
        entry,
        match: m,
        lime: false,
        title: t("{name} הציע {date}", {
          name: opponent.name,
          date: formatDayMonthTime(new Date(m.scheduled_at)),
        }),
        subParts: [t("לאישור השעה")],
      };
    }

    return null;
  }, [confirmCandidates, reportCandidates, proposedCandidates, user, t]);

  const hasOtherLeagueActivity = useMemo(() => {
    const all = [...confirmCandidates, ...reportCandidates, ...proposedCandidates];
    return all.some((e) => currentLeagueId === null || e.league_id !== currentLeagueId);
  }, [confirmCandidates, reportCandidates, proposedCandidates, currentLeagueId]);

  function triggerOpenAction() {
    if (!openAction) return;
    if (openAction.kind === "confirm") {
      setBarSheetOpen(true);
    } else if (openAction.entry.league_id != null) {
      navigate(`/leagues/${openAction.entry.league_id}`);
    }
  }

  async function confirmBarAction() {
    if (!openAction) return;
    const entry = openAction.entry;
    setBarBusy(true);
    try {
      if (entry.kind === "friendly") {
        await api.confirmFriendlyScore(entry.match.id);
      } else {
        await api.confirmScore(entry.league_id, entry.match.id);
      }
      setBarSheetOpen(false);
      reload();
    } finally {
      setBarBusy(false);
    }
  }

  async function disputeBarAction(sets) {
    if (!openAction) return;
    const entry = openAction.entry;
    setBarBusy(true);
    try {
      if (entry.kind === "friendly") {
        await api.reportFriendlyScore(entry.match.id, sets, entry.match.requires_confirmation);
      } else {
        await api.reportScore(entry.league_id, entry.match.id, sets);
      }
      setBarSheetOpen(false);
      reload();
    } finally {
      setBarBusy(false);
    }
  }

  return (
    <OpenActionContext.Provider
      value={{
        nextMatches,
        matchesLoading,
        reload,
        openAction,
        hasOtherLeagueActivity,
        triggerOpenAction,
        barSheetOpen,
        closeBarSheet: () => setBarSheetOpen(false),
        barBusy,
        confirmBarAction,
        disputeBarAction,
      }}
    >
      {children}
    </OpenActionContext.Provider>
  );
}

export function useOpenAction() {
  return useContext(OpenActionContext);
}
