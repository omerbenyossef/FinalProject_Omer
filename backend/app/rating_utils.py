from datetime import datetime

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


# The self-placement question (q6) doesn't add to the score — it's a check
# against the ability-based computed level. Each rung is the NTRP band a
# player claiming it would expect to land in.
SELF_PLACEMENT_BANDS = [
    (1.5, 2.0),
    (2.5, 3.0),
    (3.5, 4.0),
    (4.5, 5.0),
    (5.5, 5.5),  # "competed at a high level" — open-ended 5.5+, but the
    # standard path's own ceiling is 5.5 anyway (see QUESTIONNAIRE_STANDARD_MAX).
]


def apply_self_placement_check(level: float, q6: int) -> float:
    band_min, band_max = SELF_PLACEMENT_BANDS[q6]
    if level < band_min:
        gap, edge = band_min - level, band_min
    elif level > band_max:
        gap, edge = level - band_max, band_max
    else:
        gap, edge = 0.0, level

    if gap < 1.0:
        return level
    return clamp_rating(round_to_half((level + edge) / 2), max_value=QUESTIONNAIRE_STANDARD_MAX)


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


def _apply_result(
    db: Session, match: models.Match, rating: models.PlayerRating, opponent_level: float, won: bool
) -> None:
    ceiling = models.RATING_MAX if rating.competitive else QUESTIONNAIRE_STANDARD_MAX
    level_before = rating.level

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
            rating.finalized_at = datetime.utcnow()
    else:
        expected = _expected_score(rating.level, opponent_level)
        actual = 1.0 if won else 0.0
        k = RATING_K_PROVISIONAL if rating.provisional else RATING_K_STABLE
        rating.level = clamp_rating(rating.level + k * (actual - expected), max_value=ceiling)
        rating.matches_played += 1
        if rating.provisional and rating.matches_played >= models.PROVISIONAL_MATCHES:
            rating.provisional = False
            rating.finalized_at = datetime.utcnow()

    db.add(
        models.RatingSample(
            user_id=rating.user_id,
            sport_id=rating.sport_id,
            match_id=match.id,
            level_before=level_before,
            level_after=rating.level,
            opponent_level=opponent_level,
            won=won,
        )
    )


def side_level(levels: list[float]) -> float:
    """How strong a side is: the mean of its players' own levels. A singles
    side is a list of one, so this is the same function either way."""
    return sum(levels) / len(levels)


def get_pair(db: Session, pair_id: int) -> models.Pair | None:
    return db.query(models.Pair).filter(models.Pair.id == pair_id).first()


def seed_pair_level(db: Session, pair: models.Pair) -> None:
    """A new pair starts at the mean of its members' own levels rather than at
    the bottom: two strong players who have just teamed up should not have to
    climb out of a hole they never dug. From here the pair's number moves on
    its own results, and drifts away from that mean exactly as far as the
    combination turns out to be better or worse than its parts."""
    ratings = (
        get_rating(db, pair.player_a_id, pair.sport_id),
        get_rating(db, pair.player_b_id, pair.sport_id),
    )
    # Both, or neither. Averaging the one level we happen to have would hand a
    # pair the rating of its rated half — so a 4.0 who partners somebody who
    # has never touched a padel court would enter a 4.0 league as a 4.0 team,
    # and the league would have no idea what it had just admitted.
    if any(r is None for r in ratings):
        pair.level = None
        return
    pair.level = side_level([r.level for r in ratings])


def _apply_pair_result(pair: models.Pair, opponent_level: float, won: bool) -> None:
    """The pair's own rating, moved by the same ELO step as a player's."""
    if pair.level is None:
        return
    expected = _expected_score(pair.level, opponent_level)
    k = RATING_K_PROVISIONAL if pair.provisional else RATING_K_STABLE
    pair.level = clamp_rating(pair.level + k * ((1.0 if won else 0.0) - expected))
    pair.matches_played += 1
    if pair.provisional and pair.matches_played >= models.PROVISIONAL_MATCHES:
        pair.provisional = False


def update_ratings_for_doubles_match(db: Session, match: models.Match) -> None:
    """Four players and two pairs, all moved by the formula singles already
    uses. The only new idea is what goes in as "the opponent": the mean of the
    two players on the other side.

    Each player is measured against their OWN expectation, not the pair's, and
    that is what keeps a weaker player from being carried up the table. A 3.0
    alongside a 5.0 who beat a 4.0 side was not expected to win, so they gain
    a lot; their 5.0 partner was expected to, so they gain little. Lose, and it
    reverses. No special case for the gap is needed — measuring each player
    where they actually stand does it by itself."""
    if match.player1_score is None or match.player2_score is None:
        return
    winner_id = match_winner_id(match)
    if winner_id is None:
        return

    pair1, pair2 = get_pair(db, match.pair1_id), get_pair(db, match.pair2_id)
    if not pair1 or not pair2:
        return

    sport_id = match.league.sport_id if match.league_id else match.sport_id
    side1 = [get_rating(db, uid, sport_id) for uid in pair1.member_ids]
    side2 = [get_rating(db, uid, sport_id) for uid in pair2.member_ids]
    if not all(side1) or not all(side2):
        return

    # Read every level before anything moves, so that the second player on a
    # side is not measured against a number the first one just changed.
    side1_level = side_level([r.level for r in side1])
    side2_level = side_level([r.level for r in side2])
    side1_won = winner_id == match.player1_id

    for rating in side1:
        _apply_result(db, match, rating, side2_level, side1_won)
    for rating in side2:
        _apply_result(db, match, rating, side1_level, not side1_won)

    _apply_pair_result(pair1, pair2.level if pair2.level is not None else side2_level, side1_won)
    _apply_pair_result(pair2, pair1.level if pair1.level is not None else side1_level, not side1_won)
    db.commit()


def match_winner_id(match: models.Match) -> int | None:
    """Who actually won this match — decoupled from the raw set score
    because courts here are booked by the hour, so a "best of 5" match very
    often can't reach the 3-set majority before time runs out and gets
    reported short (e.g. 1 set each). The primary criterion is still sets
    won; if that's tied, this falls back to total games won across the
    reported sets, the standard amateur-tennis convention for resolving a
    match that got cut short by time. Returns None only if that's *also*
    tied — every caller must treat that as "don't count this match for
    either player", not as a loss for both."""
    if match.player1_score != match.player2_score:
        return match.player1_id if match.player1_score > match.player2_score else match.player2_id

    p1_games = sum(s["player1_games"] for s in (match.sets or []))
    p2_games = sum(s["player2_games"] for s in (match.sets or []))
    if p1_games != p2_games:
        return match.player1_id if p1_games > p2_games else match.player2_id
    return None


def update_ratings_for_match(db: Session, match: models.Match) -> None:
    """Called once a match is finalized (confirmed or auto-confirmed). Moves
    both players' ratings for the league's sport. Silently does nothing for a
    player with no rating yet (shouldn't happen once join-gating is in place,
    but matches created before this feature shipped may lack one), or for a
    match match_winner_id can't decide."""
    # One door for both games, so that every caller that finalises a match —
    # the confirm, the auto-confirm, the correction — needs to know nothing
    # about how many people were on the court.
    if match.pair1_id and match.pair2_id:
        return update_ratings_for_doubles_match(db, match)
    if match.player1_score is None or match.player2_score is None:
        return
    winner_id = match_winner_id(match)
    if winner_id is None:
        return

    sport_id = match.league.sport_id if match.league_id else match.sport_id
    r1 = get_rating(db, match.player1_id, sport_id)
    r2 = get_rating(db, match.player2_id, sport_id)
    if not r1 or not r2:
        return

    p1_won = winner_id == match.player1_id
    r1_level_before, r2_level_before = r1.level, r2.level
    _apply_result(db, match, r1, r2_level_before, p1_won)
    _apply_result(db, match, r2, r1_level_before, not p1_won)
    db.commit()
