"""189b — games somebody opened that anyone at the right level can join.

A friendly is offered to one named person; a league match is created by the
schedule. This is the third kind: a standing offer with a place, a time, a
level range and a number of seats, which fills up and — when somebody drops
out — opens again.

Whether a game is full is never stored. It is counted from the join rows (see
OpenGame.seats_left), so a cancellation reopens the game by arithmetic rather
than by a second write somebody has to remember to make.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user
from ..rating_utils import get_rating

router = APIRouter(prefix="/open-games", tags=["open-games"])

# How far ahead the list looks. A game further out than this is not what
# somebody scanning "what can I play" is asking about.
HORIZON = timedelta(days=28)


def _level_of(db: Session, user: models.User, game: models.OpenGame) -> float | None:
    """The level the game's range is checked against: the pair's in a doubles
    game, the player's own otherwise — the same rule a league join uses."""
    if game.is_doubles:
        pair = _active_pair(db, user.id, game.sport_id)
        return pair.level if pair else None
    rating = get_rating(db, user.id, game.sport_id)
    return rating.level if rating else None


def _active_pair(db: Session, user_id: int, sport_id: int) -> models.Pair | None:
    return (
        db.query(models.Pair)
        .filter(
            models.Pair.sport_id == sport_id,
            models.Pair.status == models.PairStatus.active,
            ((models.Pair.player_a_id == user_id) | (models.Pair.player_b_id == user_id)),
        )
        .order_by(models.Pair.id)
        .first()
    )


def _blocked_reason(db: Session, game: models.OpenGame, user: models.User) -> str | None:
    """Why this player cannot join, in the words the row shows. The game is
    still listed either way: a reason on the row beats an empty screen."""
    if user.id in game.player_ids:
        return None
    if game.is_doubles and not _active_pair(db, user.id, game.sport_id):
        return "צריך צמד כדי להצטרף"
    if game.is_full:
        return "המשחק מלא"
    level = _level_of(db, user, game)
    if level is None:
        return "צריך דירוג כדי להצטרף"
    if level < game.level_min or level > game.level_max:
        return "מחוץ לטווח הרמות של המשחק"
    return None


def _out(db: Session, game: models.OpenGame, user: models.User) -> schemas.OpenGameOut:
    players = [j.user for j in game.joins if j.user]
    return schemas.OpenGameOut(
        id=game.id,
        sport_id=game.sport_id,
        starts_at=game.starts_at,
        duration_minutes=game.duration_minutes,
        venue_name=game.venue.name if game.venue else None,
        court=game.court,
        where=game.where,
        level_min=game.level_min,
        level_max=game.level_max,
        is_doubles=bool(game.is_doubles),
        slots=game.slots,
        seats_taken=game.seats_taken,
        seats_left=game.seats_left,
        is_full=game.is_full,
        created_by=game.created_by,
        creator_name=game.creator.name if game.creator else "",
        players=players,
        mine=game.created_by == user.id,
        joined=user.id in game.player_ids,
        blocked_reason=_blocked_reason(db, game, user),
        match_id=game.match_id,
    )


def _live(query):
    return query.filter(
        models.OpenGame.status == models.OpenGameStatus.open,
        # A game that has become a match is not an offer any more: it lives
        # where every other match of theirs does.
        models.OpenGame.match_id.is_(None),
        models.OpenGame.starts_at >= datetime.utcnow(),
        models.OpenGame.starts_at <= datetime.utcnow() + HORIZON,
    )


def _loaded(db: Session):
    return db.query(models.OpenGame).options(
        joinedload(models.OpenGame.venue),
        joinedload(models.OpenGame.creator),
        joinedload(models.OpenGame.joins).joinedload(models.OpenGameJoin.user),
    )


def _sides(game: models.OpenGame) -> tuple[list[models.OpenGameJoin], list[models.OpenGameJoin]]:
    """The two sides of a full game. In doubles that is the two pairs; in
    singles the opener and whoever took the other seat. The opener's side is
    always side one, so the match reads the way the game did."""
    if game.is_doubles:
        order, seen = [], set()
        for j in game.joins:
            if j.pair_id and j.pair_id not in seen:
                seen.add(j.pair_id)
                order.append(j.pair_id)
        first = [j for j in game.joins if j.pair_id == order[0]]
        second = [j for j in game.joins if j.pair_id == order[1]]
        return first, second
    opener = [j for j in game.joins if j.user_id == game.created_by]
    other = [j for j in game.joins if j.user_id != game.created_by]
    return opener, other


def _hand_over_to_match(db: Session, game: models.OpenGame) -> models.Match | None:
    """A full game becomes a match.

    Everything a played game needs — a chat, a score to report, an opponent to
    confirm it and a rating to move — already exists for a friendly, so the
    game hands over to one instead of growing a second copy of all of it. The
    time needs no confirming: everybody agreed to it by joining.
    """
    if game.match_id or not game.is_full:
        return None
    first, second = _sides(game)
    if not first or not second:
        return None

    match = models.Match(
        league_id=None,
        sport_id=game.sport_id,
        kind=models.MatchKind.friendly,
        # Nobody was invited to this: they all chose it. So it starts where an
        # accepted invitation ends.
        invite_status=models.FriendlyInviteStatus.accepted,
        player1_id=first[0].user_id,
        player2_id=second[0].user_id,
        pair1_id=first[0].pair_id,
        pair2_id=second[0].pair_id,
        scheduled_at=game.starts_at,
        scheduled_by=game.created_by,
        schedule_confirmed=True,
        duration_minutes=game.duration_minutes,
        venue_id=game.venue_id,
        court=game.court,
    )
    db.add(match)
    db.flush()
    game.match_id = match.id

    for join in game.joins:
        if join.user_id == game.created_by:
            continue
        notify_user(
            db,
            join.user_id,
            "המשחק מלא",
            f"המשחק ב{game.where or 'מגרש'} מלא — אפשר לתאם ולדווח תוצאה",
            f"/matches/{match.id}",
            title_en="Your game is full",
            body_en=f"The game at {game.where or 'the court'} is full — you can talk and report the score",
            match_id=match.id,
        )
    return match


@router.get("", response_model=list[schemas.OpenGameOut])
def list_open_games(
    sport_id: int,
    mine: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Every open game in this sport, soonest first.

    Deliberately not filtered down to the games the viewer can join: a game
    out of their range, or one that has just filled, is still worth seeing —
    the row says why they cannot take it. The screen groups them; the server
    only says which is which, through blocked_reason.
    """
    query = _live(_loaded(db).filter(models.OpenGame.sport_id == sport_id))
    if mine:
        query = query.filter(models.OpenGame.created_by == current_user.id)
    games = query.order_by(models.OpenGame.starts_at).all()
    return [_out(db, g, current_user) for g in games]


@router.post("", response_model=schemas.OpenGameOut, status_code=status.HTTP_201_CREATED)
def open_game(
    payload: schemas.OpenGameCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sport = db.query(models.Sport).filter(models.Sport.id == payload.sport_id).first()
    if not sport:
        raise HTTPException(status_code=404, detail="ענף לא נמצא")
    if payload.starts_at.replace(tzinfo=None) <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="הזמן כבר עבר")

    is_doubles = sport.plays_in_pairs if payload.is_doubles is None else payload.is_doubles
    # The opener takes the first seat (or the first two, as a pair), so a game
    # always has at least the person who wants to play in it.
    pair = _active_pair(db, current_user.id, sport.id) if is_doubles else None
    if is_doubles and not pair:
        raise HTTPException(status_code=400, detail="צריך צמד כדי לפתוח משחק זוגות")

    level = pair.level if is_doubles else (
        get_rating(db, current_user.id, sport.id).level
        if get_rating(db, current_user.id, sport.id)
        else None
    )
    # A range nobody chose is a window around the opener, so the game finds
    # people they can actually play against.
    default_min = max(models.RATING_MIN, (level or models.RATING_MIN) - 0.5)
    default_max = min(models.RATING_MAX, (level or models.RATING_MAX) + 0.5)

    game = models.OpenGame(
        sport_id=sport.id,
        created_by=current_user.id,
        is_doubles=is_doubles,
        venue_id=payload.venue_id,
        court=payload.court,
        starts_at=payload.starts_at.replace(tzinfo=None),
        duration_minutes=payload.duration_minutes,
        level_min=payload.level_min if payload.level_min is not None else default_min,
        level_max=payload.level_max if payload.level_max is not None else default_max,
        slots=4 if is_doubles else 2,
    )
    db.add(game)
    db.flush()
    _seat(db, game, current_user, pair)
    db.commit()
    db.refresh(game)
    return _out(db, game, current_user)


def _seat(db: Session, game: models.OpenGame, user: models.User, pair: models.Pair | None) -> None:
    """Put somebody in a game. A pair takes both of its seats, one row each,
    so the seats stay counted in people."""
    if pair:
        for member_id in pair.member_ids:
            db.add(models.OpenGameJoin(open_game_id=game.id, user_id=member_id, pair_id=pair.id))
    else:
        db.add(models.OpenGameJoin(open_game_id=game.id, user_id=user.id))


@router.post("/{game_id}/join", response_model=schemas.OpenGameOut)
def join(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    game = _loaded(db).filter(models.OpenGame.id == game_id).first()
    if not game or game.status != models.OpenGameStatus.open:
        raise HTTPException(status_code=404, detail="המשחק לא נמצא")
    if current_user.id in game.player_ids:
        return _out(db, game, current_user)
    reason = _blocked_reason(db, game, current_user)
    if reason:
        raise HTTPException(status_code=400, detail=reason)

    pair = _active_pair(db, current_user.id, game.sport_id) if game.is_doubles else None
    # A pair needs two seats, and the check above only knows the game is not
    # full — it could still have one seat left.
    if pair and game.seats_left < 2:
        raise HTTPException(status_code=400, detail="נשאר מקום לשחקן אחד בלבד")
    _seat(db, game, current_user, pair)
    db.flush()
    db.refresh(game)
    _hand_over_to_match(db, game)
    db.commit()
    db.refresh(game)
    return _out(db, game, current_user)


@router.post("/{game_id}/leave", response_model=schemas.OpenGameOut)
def leave(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Drop out. The seat is freed by the row going away, which is what
    reopens a full game."""
    game = _loaded(db).filter(models.OpenGame.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="המשחק לא נמצא")
    if game.match_id:
        # Past the handover there is a match with a chat and a result waiting;
        # calling it off is that match's business, not this one's.
        raise HTTPException(status_code=400, detail="המשחק כבר נקבע — אפשר לבטל אותו ממסך המשחק")
    rows = [j for j in game.joins if j.user_id == current_user.id]
    if not rows:
        raise HTTPException(status_code=400, detail="אינך במשחק הזה")
    # Leaving as half of a pair takes the pair out: the other half cannot play
    # a doubles game alone.
    pair_id = rows[0].pair_id
    for j in list(game.joins):
        if j.user_id == current_user.id or (pair_id and j.pair_id == pair_id):
            db.delete(j)
    db.commit()
    db.refresh(game)
    return _out(db, game, current_user)


@router.post("/{game_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    game = db.query(models.OpenGame).filter(models.OpenGame.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="המשחק לא נמצא")
    if game.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="רק מי שפתח את המשחק יכול לבטל אותו")
    if game.match_id:
        raise HTTPException(status_code=400, detail="המשחק כבר נקבע — אפשר לבטל אותו ממסך המשחק")
    game.status = models.OpenGameStatus.cancelled
    game.cancelled_at = datetime.utcnow()
    db.commit()
