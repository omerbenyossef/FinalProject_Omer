import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext.jsx";
import { useSport } from "./SportContext.jsx";
import RatingQuestionnaire from "./RatingQuestionnaire.jsx";

function seenKey(sportId) {
  return `ratingPromptSeen:${sportId}`;
}

// Prompts every user, once per sport, to rate themselves the moment they
// enter the app with a sport selected — RatingQuestionnaire needs a league
// as context, so we anchor to one of the user's own leagues in that sport
// if they have one (join is then a harmless no-op), otherwise to any open
// (no-invite-code) league in that sport so the result screen's "Join"
// button actually works.
export default function SelfRatingPrompt() {
  const { user } = useAuth();
  const { selectedSportId, sports } = useSport();
  const [league, setLeague] = useState(null);

  useEffect(() => {
    if (!user || !selectedSportId) return;
    if (localStorage.getItem(seenKey(selectedSportId))) return;

    let cancelled = false;
    Promise.all([api.myRatings(), api.myLeagues(), api.listLeagues()]).then(
      ([ratings, myLeagues, allLeagues]) => {
        if (cancelled) return;
        const hasRating = ratings.some((r) => r.sport_id === selectedSportId);
        if (hasRating) return;
        const myLeagueForSport = myLeagues.find((l) => l.sport.id === selectedSportId);
        const openLeagueForSport = allLeagues.find((l) => l.sport.id === selectedSportId && l.is_open);
        const anchor = myLeagueForSport || openLeagueForSport;
        if (anchor) {
          setLeague(anchor);
          localStorage.setItem(seenKey(selectedSportId), "1");
        }
      }
    );
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
