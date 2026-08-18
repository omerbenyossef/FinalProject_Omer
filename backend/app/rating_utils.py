from sqlalchemy.orm import Session

from . import models

# Post-match adjustment: no formula was specified in the design doc, so this
# is a deliberately simple ELO-style update — a bigger K-factor during the
# provisional period (first PROVISIONAL_MATCHES matches) so an off self-rating
# corrects quickly, a smaller one afterwards for gradual drift.
RATING_K_PROVISIONAL = 0.4
RATING_K_STABLE = 0.1

# The 5-question path can't distinguish 5.5 from 7.0 (see playerlevelrating2.md
# "Scoring") — only the competitive route can produce a level above this, and
# a non-competitive rating can never drift past it through match results
# either, so this is also the ceiling _apply_result uses for those players.
QUESTIONNAIRE_STANDARD_MAX = 5.5


def round_to_half(value: float) -> float:
    return round(value * 2) / 2


def clamp_rating(value: float, max_value: float = models.RATING_MAX) -> float:
    return max(models.RATING_MIN, min(max_value, value))


def compute_questionnaire_level(q1: int, q2: int, q3: int, q4: int, q5: int) -> float:
    base = 1.5 + 0.5 * (q4 + q5)
    ctx = (q1 + q2 + q3) / 9
    adjust = round((ctx - 0.5) * 2) / 2
    return clamp_rating(round_to_half(base + adjust), max_value=QUESTIONNAIRE_STANDARD_MAX)


def compute_competitive_level(venue: int) -> float:
    """venue: 0=club/regional league, 1=college/national team,
    2=satellite/futures/ITF, 3=tour level → 5.5, 6.0, 6.5, 7.0."""
    return clamp_rating(5.5 + 0.5 * venue)


def band_name(level: float) -> str:
    if level <= 1.5:
        return "New player"
    if level <= 2.5:
        return "Beginner"
    if level <= 3.5:
        return "Intermediate"
    if level <= 5.5:
        return "Advanced"
    if level <= 6.5:
        return "Competitive"
    return "Professional"


def get_rating(db: Session, user_id: int, sport_id: int) -> models.PlayerRating | None:
    return (
        db.query(models.PlayerRating)
        .filter(models.PlayerRating.user_id == user_id, models.PlayerRating.sport_id == sport_id)
        .first()
    )


def _expected_score(my_level: float, opponent_level: float) -> float:
    return 1 / (1 + 10 ** ((opponent_level - my_level) / 2.0))


def _apply_result(rating: models.PlayerRating, opponent_level: float, won: bool) -> None:
    ceiling = models.RATING_MAX if rating.competitive else QUESTIONNAIRE_STANDARD_MAX

    # Competitive-route players correct downward in full steps during their
    # provisional window instead of the usual ELO nudge — the error this
    # route exists to catch is a rating set too high (competed years ago,
    # doesn't play at that level anymore), not one set too low.
    if rating.competitive and rating.provisional:
        if not won and opponent_level < rating.level:
            rating.level = clamp_rating(round_to_half(rating.level) - 1.0, max_value=ceiling)
        rating.matches_played += 1
        if rating.matches_played >= models.PROVISIONAL_MATCHES:
            rating.provisional = False
        return

    expected = _expected_score(rating.level, opponent_level)
    actual = 1.0 if won else 0.0
    k = RATING_K_PROVISIONAL if rating.provisional else RATING_K_STABLE
    rating.level = clamp_rating(rating.level + k * (actual - expected), max_value=ceiling)
    rating.matches_played += 1
    if rating.provisional and rating.matches_played >= models.PROVISIONAL_MATCHES:
        rating.provisional = False


def update_ratings_for_match(db: Session, match: models.Match) -> None:
    """Called once a match is finalized (confirmed or auto-confirmed). Moves
    both players' ratings for the league's sport. Silently does nothing for a
    player with no rating yet (shouldn't happen once join-gating is in place,
    but matches created before this feature shipped may lack one)."""
    if match.player1_score is None or match.player2_score is None:
        return
    if match.player1_score == match.player2_score:
        return

    sport_id = match.league.sport_id if match.league_id else match.sport_id
    r1 = get_rating(db, match.player1_id, sport_id)
    r2 = get_rating(db, match.player2_id, sport_id)
    if not r1 or not r2:
        return

    p1_won = match.player1_score > match.player2_score
    r1_level_before, r2_level_before = r1.level, r2.level
    _apply_result(r1, r2_level_before, p1_won)
    _apply_result(r2, r1_level_before, not p1_won)
    db.commit()
