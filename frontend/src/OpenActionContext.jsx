import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { getActionCandidates, buildOpenAction } from "./matchUtils.js";

const OpenActionContext = createContext(null);

export function OpenActionProvider({ children }) {
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [nextMatches, setNextMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

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

  const actionCandidates = useMemo(
    () => getActionCandidates(relevantEntries, user?.id),
    [relevantEntries, user]
  );

  const openAction = useMemo(
    () => buildOpenAction(actionCandidates, user?.id, t),
    [actionCandidates, user, t]
  );

  const hasOtherLeagueActivity = useMemo(() => {
    const all = [...actionCandidates.confirm, ...actionCandidates.report, ...actionCandidates.proposed];
    return all.some((e) => currentLeagueId === null || e.league_id !== currentLeagueId);
  }, [actionCandidates, currentLeagueId]);

  function triggerOpenAction() {
    if (!openAction) return;
    if (openAction.kind === "confirm") {
      navigate(`/matches/${openAction.match.id}/confirm`);
    } else if (openAction.kind === "schedule") {
      navigate(`/matches/${openAction.match.id}`);
    } else if (openAction.entry.kind === "friendly") {
      navigate("/profile");
    } else if (openAction.entry.league_id != null) {
      navigate(`/leagues/${openAction.entry.league_id}`);
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
      }}
    >
      {children}
    </OpenActionContext.Provider>
  );
}

export function useOpenAction() {
  return useContext(OpenActionContext);
}
