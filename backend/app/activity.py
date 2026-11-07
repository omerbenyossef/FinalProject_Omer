"""Writing the feed.

One function per thing worth telling people about, called from the place
where that thing actually happens. They are deliberately forgiving: a feed
entry is a nicety, and nothing here may ever be the reason a result fails to
save or a game fails to open.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from . import models


def _record(db: Session, **fields) -> None:
    """Add the event to the session the caller is already in, so it lands in
    the same transaction as the thing it describes — an event for a result
    that then failed to save would be a lie the feed keeps repeating.

    Not flushed here: a flush of its own could raise inside somebody else's
    half-finished work, and the caller's commit writes this row anyway."""
    db.add(models.ActivityEvent(**fields))


def _area_of(user: models.User | None) -> str | None:
    return getattr(user, "area", None)


def match_result(db: Session, match: models.Match, winner_id: int | None) -> None:
    """A confirmed result. The score travels in the payload because the match
    row can be corrected later and the line in the feed should not quietly
    change under somebody who already read it."""
    if winner_id is None:
        return
    loser_id = match.player2_id if winner_id == match.player1_id else match.player1_id
    winner = db.get(models.User, winner_id) if winner_id else None
    _record(
        db,
        type=models.ActivityType.match_result,
        actor_user_id=winner_id,
        target_user_id=loser_id,
        league_id=match.league_id,
        match_id=match.id,
        sport_id=match.sport_id or (match.league.sport_id if match.league else None),
        area=_area_of(winner),
        payload={"sets": match.sets or [], "score": f"{match.player1_score}-{match.player2_score}"},
    )


def level_up(db: Session, user: models.User, sport_id: int, level: float) -> None:
    _record(
        db,
        type=models.ActivityType.level_up,
        actor_user_id=user.id,
        sport_id=sport_id,
        area=_area_of(user),
        payload={"level": round(level, 1)},
    )


def player_joined(db: Session, user: models.User, sport_id: int, level: float | None) -> None:
    _record(
        db,
        type=models.ActivityType.player_joined,
        actor_user_id=user.id,
        sport_id=sport_id,
        area=_area_of(user),
        payload={"level": round(level, 1) if level is not None else None},
    )


def open_game_created(db: Session, user: models.User, game: models.OpenGame) -> None:
    _record(
        db,
        type=models.ActivityType.open_game_created,
        actor_user_id=user.id,
        open_game_id=game.id,
        sport_id=game.sport_id,
        area=_area_of(user),
        payload={
            "starts_at": game.starts_at.isoformat() if game.starts_at else None,
            "where": game.where,
            "is_doubles": bool(game.is_doubles),
        },
    )


def league_started(db: Session, league: models.League, player_count: int) -> None:
    _record(
        db,
        type=models.ActivityType.league_started,
        league_id=league.id,
        sport_id=league.sport_id,
        payload={"name": league.name, "players": player_count},
    )
