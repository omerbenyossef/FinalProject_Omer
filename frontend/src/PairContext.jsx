import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";

/* In padel you are never just yourself: the thing that enters a league, holds
   a rating and plays a match is the pair. So the app keeps one of your pairs
   selected the way it keeps a sport selected, and the screens read the game
   through it.

   A sport that is played one against one has no pairs and never asks for one,
   so everything here stays empty and every consumer falls back to the single
   player they already were. */

const STORAGE_KEY = "rally-selected-pair";
const PairContext = createContext(null);

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function PairProvider({ children }) {
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBySport, setSelectedBySport] = useState(readStored);

  const reload = useCallback(async () => {
    if (!user || !selectedSportId) {
      setPairs([]);
      return;
    }
    setLoading(true);
    try {
      setPairs(await api.myPairs(selectedSportId));
    } catch {
      // A pair list that fails to load must not take the screen down with it:
      // every consumer treats "no pairs" as "go and find a partner".
      setPairs([]);
    } finally {
      setLoading(false);
    }
  }, [user, selectedSportId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const active = useMemo(() => pairs.filter((p) => p.status === "active"), [pairs]);
  const pending = useMemo(() => pairs.filter((p) => p.status === "pending"), [pairs]);
  // Only the ones waiting on me are worth a badge; the ones waiting on them
  // are not mine to act on.
  const awaitingMe = useMemo(() => pending.filter((p) => !p.proposed_by_me), [pending]);

  const selectedPairId = selectedSportId ? selectedBySport[selectedSportId] ?? null : null;
  const selectedPair =
    active.find((p) => p.id === selectedPairId) ?? active[0] ?? null;

  const setSelectedPairId = useCallback(
    (id) => {
      if (!selectedSportId) return;
      setSelectedBySport((current) => {
        const next = { ...current, [selectedSportId]: id };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // A browser that refuses storage still gets a working switcher for
          // this visit; it just forgets the choice next time.
        }
        return next;
      });
    },
    [selectedSportId]
  );

  return (
    <PairContext.Provider
      value={{
        pairs,
        activePairs: active,
        pendingPairs: pending,
        pairsAwaitingMe: awaitingMe,
        selectedPair,
        setSelectedPairId,
        loading,
        reload,
      }}
    >
      {children}
    </PairContext.Provider>
  );
}

export function usePairs() {
  return useContext(PairContext) ?? {
    pairs: [],
    activePairs: [],
    pendingPairs: [],
    pairsAwaitingMe: [],
    selectedPair: null,
    setSelectedPairId: () => {},
    loading: false,
    reload: () => {},
  };
}
