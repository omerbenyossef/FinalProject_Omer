"""Who is in a match, and who is on the other side of it.

A singles match is two people in player1_id/player2_id. A doubles match is
four, and those two columns name one member of each side — enough for the
result, the reminders and the scheduling, which only ever needed to know which
SIDE did what, but not enough for a screen, a chat, or the sentence "you are
playing X".

Everything that needs the whole court asks here, so there is one answer rather
than four nearly-right ones.
"""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from . import models


def _pair(db: Session, pair_id: int | None) -> models.Pair | None:
    if not pair_id:
        return None
    return (
        db.query(models.Pair)
        .options(joinedload(models.Pair.player_a), joinedload(models.Pair.player_b))
        .filter(models.Pair.id == pair_id)
        .first()
    )


def sides(db: Session, match: models.Match) -> tuple[list[models.User], list[models.User]]:
    """The two sides, each as a list of players: one each in singles, two each
    in doubles. Side one is always the match's player1 side, so the order
    matches how scores and sets are stored."""
    if match.pair1_id and match.pair2_id:
        p1, p2 = _pair(db, match.pair1_id), _pair(db, match.pair2_id)
        if p1 and p2:
            return ([p1.player_a, p1.player_b], [p2.player_a, p2.player_b])
    # Either a singles match, or a doubles one whose pairs have gone: fall back
    # to the two named players rather than returning nothing.
    return ([match.player1] if match.player1 else [], [match.player2] if match.player2 else [])


def participant_ids(db: Session, match: models.Match) -> set[int]:
    a, b = sides(db, match)
    return {u.id for u in a + b if u}


def is_participant(db: Session, match: models.Match, user_id: int) -> bool:
    return user_id in participant_ids(db, match)


def my_side_is_first(db: Session, match: models.Match, user_id: int) -> bool:
    """Which half of the stored score belongs to this viewer."""
    first, _ = sides(db, match)
    return any(u and u.id == user_id for u in first)


def opponents(db: Session, match: models.Match, user_id: int) -> list[models.User]:
    first, second = sides(db, match)
    return [u for u in (second if my_side_is_first(db, match, user_id) else first) if u]


def teammate(db: Session, match: models.Match, user_id: int) -> models.User | None:
    first, second = sides(db, match)
    mine = first if my_side_is_first(db, match, user_id) else second
    for user in mine:
        if user and user.id != user_id:
            return user
    return None


def others(db: Session, match: models.Match, user_id: int) -> list[int]:
    """Everybody else on the court — three people in doubles. What a chat
    message or a "the time is set" notice has to reach."""
    return [uid for uid in participant_ids(db, match) if uid != user_id]


# These two live on the models module, because Match's own side1_label/
# side2_label properties need them and models cannot import this one back.
# Re-exported here so the callers that already ask this module for them
# keep working.
short_name = models.short_name
side_label = models.side_label


def opponent_label(db: Session, match: models.Match, user_id: int) -> str:
    return side_label(opponents(db, match, user_id))


def my_pair_ids(user_id: int):
    """A subquery of the pairs this player belongs to. Status is not filtered:
    a dissolved pair's matches were still theirs."""
    return select(models.Pair.id).where(
        or_(models.Pair.player_a_id == user_id, models.Pair.player_b_id == user_id)
    )


def mine(user_id: int):
    """"This match is mine", as SQL.

    player1_id/player2_id name one member of each side, so on a doubles match
    the other two are not in either column — and a filter built only from them
    found none of their own matches. Measured before this existed: the second
    member of a pair saw 0 of their 3.

    Every "my matches" query uses this, so there is one definition of whose
    match it is rather than one per screen.
    """
    pairs = my_pair_ids(user_id)
    return or_(
        models.Match.player1_id == user_id,
        models.Match.player2_id == user_id,
        models.Match.pair1_id.in_(pairs),
        models.Match.pair2_id.in_(pairs),
    )
