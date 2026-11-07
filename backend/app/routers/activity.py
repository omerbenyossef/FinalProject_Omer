"""203b — reading the feed.

The home screen's "around you" section. The app's whole surface was the
player's own business: their matches, their leagues, their rating. Nothing on
it suggested anybody else was playing, which is most of why it felt closed.

This is the read side only; the events themselves are written by `activity.py`
at the moment each thing happens.

Two decisions worth keeping:

* **Who counts as "around you"** is answered three ways at once — people in
  my leagues, people at my level in my area, and my leagues themselves — and
  a player new to the app matches none of them. The feed is thin for them
  rather than empty: the client fills the rest with generic lines, because the
  copy for those belongs where the translations are.
* **New players arrive in a weekly batch.** One row per person would make a
  quiet week read as a crowd and a busy one bury every result, so the joins of
  the last week collapse into a single row with a count and three faces.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..rating_utils import get_rating

router = APIRouter(prefix="/activity", tags=["activity"])

# How far back the feed looks. Older than this and it is not news; it is the
# archive, which this screen is not.
WINDOW = timedelta(days=14)
# The window the joins of new players collapse into.
JOIN_WINDOW = timedelta(days=7)
# How close counts as "at your level" — the same half-step the league ranges
# are drawn in.
LEVEL_BAND = 0.5
# Faces on the aggregated row. More than three and the stack stops reading as
# a stack.
FACES = 3


def _my_league_ids(db: Session, user_id: int, sport_id: int | None) -> set[int]:
    query = (
        db.query(models.LeagueMembership.league_id)
        .join(models.League, models.League.id == models.LeagueMembership.league_id)
        .filter(models.LeagueMembership.user_id == user_id)
    )
    if sport_id is not None:
        query = query.filter(models.League.sport_id == sport_id)
    return {row[0] for row in query.all()}


def _people_in(db: Session, league_ids: set[int]) -> set[int]:
    if not league_ids:
        return set()
    rows = (
        db.query(models.LeagueMembership.user_id)
        .filter(models.LeagueMembership.league_id.in_(league_ids))
        .all()
    )
    return {row[0] for row in rows}


def _near_level(db: Session, user: models.User, sport_id: int | None) -> set[int]:
    """People in my area whose rating is within half a step of mine.

    No rating of my own means no band to compare against, so this returns
    nobody rather than everybody: a feed of players whose level I cannot be
    matched against is not a feed of people I might play."""
    if sport_id is None or not user.area:
        return set()
    rating = get_rating(db, user.id, sport_id)
    if rating is None or rating.level is None:
        return set()
    rows = (
        db.query(models.PlayerRating.user_id)
        .join(models.User, models.User.id == models.PlayerRating.user_id)
        .filter(
            models.PlayerRating.sport_id == sport_id,
            models.PlayerRating.level >= rating.level - LEVEL_BAND,
            models.PlayerRating.level <= rating.level + LEVEL_BAND,
            models.User.area == user.area,
            models.User.deleted_at.is_(None),
            # The demo league exists to show a club a full table; its players
            # must never turn up anywhere a real player could try to play them.
            models.User.is_demo.isnot(True),
        )
        .all()
    )
    return {row[0] for row in rows}


def _person(user: models.User | None) -> schemas.PairPlayerOut | None:
    if user is None:
        return None
    return schemas.PairPlayerOut(
        id=user.id, name=user.name, photo_url=user.photo_url, area=user.area
    )


def _item(event: models.ActivityEvent) -> schemas.ActivityItemOut:
    actor = event.actor
    return schemas.ActivityItemOut(
        id=event.id,
        type=event.type.value if hasattr(event.type, "value") else str(event.type),
        created_at=event.created_at or datetime.utcnow(),
        actor_id=actor.id if actor else None,
        actor_name=actor.name if actor else None,
        actor_photo_url=actor.photo_url if actor else None,
        target_name=event.target.name if event.target else None,
        league_id=event.league_id,
        league_name=event.league.name if event.league else None,
        match_id=event.match_id,
        open_game_id=event.open_game_id,
        payload=event.payload or {},
    )


@router.get("", response_model=list[schemas.ActivityItemOut])
def feed(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    sport_id: int | None = None,
    limit: int = 6,
):
    limit = max(1, min(limit, 30))
    now = datetime.utcnow()
    since = now - WINDOW

    league_ids = _my_league_ids(db, current_user.id, sport_id)
    known = _people_in(db, league_ids) | _near_level(db, current_user, sport_id)
    # My own doings are not news to me, and a feed that tells me I won my own
    # match is the app talking to itself.
    known.discard(current_user.id)

    query = (
        db.query(models.ActivityEvent)
        .options(
            joinedload(models.ActivityEvent.actor),
            joinedload(models.ActivityEvent.target),
            joinedload(models.ActivityEvent.league),
        )
        .filter(models.ActivityEvent.created_at >= since)
        # Not simply `!= current_user.id`: a league starting has no actor at
        # all, and in SQL a NULL compared to anything is NULL, so the one
        # event type nobody does was being dropped from every feed.
        .filter(
            or_(
                models.ActivityEvent.actor_user_id.is_(None),
                models.ActivityEvent.actor_user_id != current_user.id,
            )
        )
    )
    if sport_id is not None:
        query = query.filter(
            or_(
                models.ActivityEvent.sport_id == sport_id,
                models.ActivityEvent.sport_id.is_(None),
            )
        )
    reach = []
    if known:
        reach.append(models.ActivityEvent.actor_user_id.in_(known))
    if league_ids:
        reach.append(models.ActivityEvent.league_id.in_(league_ids))
    if not reach:
        return []
    query = query.filter(or_(*reach))

    # Read more rows than the screen shows: the joins of the week collapse
    # into one row, so the ones that fall away have to be replaced by older
    # news rather than leaving the feed short.
    rows = query.order_by(models.ActivityEvent.created_at.desc()).limit(limit * 4).all()

    joins = [
        e
        for e in rows
        if e.type == models.ActivityType.player_joined
        and e.created_at
        and e.created_at >= now - JOIN_WINDOW
    ]
    items: list[schemas.ActivityItemOut] = []
    for event in rows:
        if event.type == models.ActivityType.player_joined:
            continue
        # A demo player's result is not something a real player should be
        # reading about, let alone clapping at.
        if event.actor is not None and event.actor.is_demo:
            continue
        items.append(_item(event))

    if joins:
        people = []
        seen: set[int] = set()
        for event in joins:
            if event.actor and event.actor.id not in seen and not event.actor.is_demo:
                seen.add(event.actor.id)
                person = _person(event.actor)
                if person:
                    people.append(person)
        if people:
            items.append(
                schemas.ActivityItemOut(
                    id=0,
                    type="players_joined",
                    created_at=joins[0].created_at or now,
                    payload={},
                    people=people[:FACES],
                    count=len(people),
                )
            )

    items.sort(key=lambda i: i.created_at, reverse=True)
    items = items[:limit]

    # Claps in one round trip for the whole page, not one per row.
    event_ids = [i.id for i in items if i.id]
    if event_ids:
        counts = dict(
            db.query(models.ActivityReaction.event_id, func.count(models.ActivityReaction.id))
            .filter(models.ActivityReaction.event_id.in_(event_ids))
            .group_by(models.ActivityReaction.event_id)
            .all()
        )
        mine = {
            row[0]
            for row in db.query(models.ActivityReaction.event_id)
            .filter(
                models.ActivityReaction.event_id.in_(event_ids),
                models.ActivityReaction.user_id == current_user.id,
            )
            .all()
        }
        for item in items:
            item.claps = counts.get(item.id, 0)
            item.i_clapped = item.id in mine

    return items


@router.post("/{event_id}/clap", response_model=schemas.ActivityClapOut)
def clap(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Toggle. One endpoint rather than a POST and a DELETE, because the
    button is one button and the client should not have to track which of two
    requests its own last tap left it owing."""
    event = db.get(models.ActivityEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="הפעילות לא נמצאה")

    existing = (
        db.query(models.ActivityReaction)
        .filter(
            models.ActivityReaction.event_id == event_id,
            models.ActivityReaction.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        db.delete(existing)
        mine = False
    else:
        db.add(models.ActivityReaction(event_id=event_id, user_id=current_user.id))
        mine = True
    db.commit()

    claps = (
        db.query(func.count(models.ActivityReaction.id))
        .filter(models.ActivityReaction.event_id == event_id)
        .scalar()
        or 0
    )
    return schemas.ActivityClapOut(claps=claps, i_clapped=mine)
