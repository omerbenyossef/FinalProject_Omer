import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import { useLanguage } from "./LanguageContext.jsx";
import { buildTabbarPreview, openItemRoute } from "./matchUtils.js";

const OpenActionContext = createContext(null);

export function OpenActionProvider({ children }) {
  const { user } = useAuth();
  const { selectedSportId } = useSport();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [nextMatches, setNextMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [openItems, setOpenItems] = useState([]);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [openItemsLoading, setOpenItemsLoading] = useState(true);

  function reload() {
    if (!user) return Promise.resolve();
    api
      .myNextMatches()
      .then(setNextMatches)
      .catch(() => {})
      .finally(() => setMatchesLoading(false));
    return api
      .myOpenItems()
      .then((data) => {
        setOpenItems(data.items);
        setScheduledCount(data.scheduled_count);
      })
      .catch(() => {})
      .finally(() => setOpenItemsLoading(false));
  }

  useEffect(() => {
    if (!user) {
      setNextMatches([]);
      setOpenItems([]);
      setScheduledCount(0);
      setMatchesLoading(false);
      setOpenItemsLoading(false);
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // The tab-bar button lives in the layout, so it never remounts and used to
  // keep advertising work that was already done — every screen had to remember
  // to call reload() after acting, and a screen that forgot (or acted without
  // navigating) left "דווח תוצאה" sitting there. Refetching on every route
  // change covers all of them; an action that doesn't navigate still calls
  // reload() itself.
  useEffect(() => {
    if (user) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const currentLeagueId = useMemo(() => {
    const m = location.pathname.match(/^\/leagues\/(\d+)/);
    return m ? Number(m[1]) : null;
  }, [location.pathname]);

  const relevantEntries = useMemo(
    () => nextMatches.filter((entry) => entry.sport_id === selectedSportId),
    [nextMatches, selectedSportId]
  );

  // Once you're already on the screen an item would send you to, it's not
  // "something to go do" anymore — drop it so the tabbar button (and its
  // count) don't keep pointing at the page you're already looking at.
  const relevantItems = useMemo(
    () =>
      openItems.filter(
        (item) => item.sport_id === selectedSportId && openItemRoute(item) !== location.pathname
      ),
    [openItems, selectedSportId, location.pathname]
  );

  const itemCount = relevantItems.length;

  // The red count on the home-screen icon. It answers "is anything waiting for
  // me" from outside the app, so it counts differently from the tab bar:
  // nothing is dropped for being the page you happen to be on, and a match
  // waiting on the opponent isn't counted — a badge that sends someone in to
  // find nothing they can do teaches them to ignore it.
  const badgeCount = useMemo(
    () =>
      openItems.filter((item) => item.sport_id === selectedSportId && item.type !== "waiting")
        .length,
    [openItems, selectedSportId]
  );

  useEffect(() => {
    // Only installed apps show a badge, and only some platforms have the API
    // at all; everywhere else these calls simply don't exist.
    if (!("setAppBadge" in navigator)) return;
    const done = user && !openItemsLoading;
    try {
      if (done && badgeCount > 0) navigator.setAppBadge(badgeCount);
      else navigator.clearAppBadge();
    } catch {
      // A platform that has the method but refuses the call (permission,
      // private window) — the badge is a nicety, never worth an error.
    }
  }, [badgeCount, user, openItemsLoading]);

  const openAction = useMemo(
    () => buildTabbarPreview(relevantItems[0] ?? null, user?.id, t),
    [relevantItems, user, t]
  );

  const hasOtherLeagueActivity = useMemo(() => {
    const actionable = relevantItems.filter((item) => item.type !== "waiting");
    return actionable.some((item) => currentLeagueId === null || item.league_id !== currentLeagueId);
  }, [relevantItems, currentLeagueId]);

  function triggerOpenAction() {
    if (itemCount === 0) return;
    if (itemCount >= 2) {
      // The full "what needs you" list lives on the notifications screen;
      // /needs-you is only the unsettled-results screen now.
      navigate("/notifications");
      return;
    }
    navigate(openItemRoute(relevantItems[0]));
  }

  return (
    <OpenActionContext.Provider
      value={{
        nextMatches,
        matchesLoading,
        reload,
        openItems: relevantItems,
        itemCount,
        openItemsLoading,
        scheduledCount,
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
