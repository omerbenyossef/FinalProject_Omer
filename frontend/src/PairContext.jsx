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
  const { selectedSportId, selectedSport } = useSport();
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBySport, setSelectedBySport] = useState(readStored);
  // Which sport's pair list has actually come back. The selected pair is a
  // lens on every screen now, so a screen that fetches before the list lands
  // asks "all my pairs" and then has to correct itself — and for a moment
  // shows the other pair's match. Screens wait for this instead.
  const [loadedSportId, setLoadedSportId] = useState(null);

  const reload = useCallback(async () => {
    if (!user || !selectedSportId) {
      setPairs([]);
      // Only a signed-in player with a sport can have a settled pair list.
      // Marking it settled while the session is still loading made the lens
      // read "ready, no pairs" for a moment, and every screen fetched the
      // unfiltered question in that moment.
      setLoadedSportId(user ? selectedSportId : null);
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
      setLoadedSportId(selectedSportId);
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
        // A one-against-one sport has no pairs and never waits for them.
        // Not ready until the selected sport itself is known: before the
        // sports load there is no way to tell a pairs sport from a singles
        // one, and `!undefined?.plays_in_pairs` reads as "singles, go ahead".
        // A screen that fetched in that gap asked the unfiltered question and
        // then had to race its own answer — measured as two rounds of
        // /leagues/mine, the second one filtered.
        pairLensReady: selectedSport
          ? !selectedSport.plays_in_pairs || loadedSportId === selectedSportId
          : false,
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
    pairLensReady: true,
    loading: false,
    reload: () => {},
  };
}
