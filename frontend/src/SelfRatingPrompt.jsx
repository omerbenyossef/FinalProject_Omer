import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import RatingQuestionnaire from "./RatingQuestionnaire.jsx";

function seenKey(sportId) {
  return `ratingPromptSeen:${sportId}`;
}

// Admin-only: the product owner creates every league himself, and league
// creation adds him as a member without the rating gate join_league enforces
// for everyone else — so he never naturally meets the questionnaire. This
// shows it once per sport, using one of his own leagues in that sport as
// context (he's already a member of it, so the result screen's "Join"
// button is a harmless no-op there).
export default function SelfRatingPrompt() {
  const { user } = useAuth();
  const { selectedSportId, sports } = useSport();
  const [league, setLeague] = useState(null);

  useEffect(() => {
    if (!user?.is_admin || !selectedSportId) return;
    if (localStorage.getItem(seenKey(selectedSportId))) return;

    let cancelled = false;
    Promise.all([api.myRatings(), api.myLeagues()]).then(([ratings, leagues]) => {
      if (cancelled) return;
      const hasRating = ratings.some((r) => r.sport_id === selectedSportId);
      const leagueForSport = leagues.find((l) => l.sport.id === selectedSportId);
      if (!hasRating && leagueForSport) {
        setLeague(leagueForSport);
        localStorage.setItem(seenKey(selectedSportId), "1");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, selectedSportId]);

  if (!league) return null;

  const sportName = sports.find((s) => s.id === selectedSportId)?.name;

  return (
    <RatingQuestionnaire
      league={league}
      sportName={sportName}
      onClose={() => setLeague(null)}
      onJoined={() => setLeague(null)}
    />
  );
}
