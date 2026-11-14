"""213a/213b — the fixed list of places.

A player's area used to be whatever they typed into a box, and a venue's was
the same. So "תל אביב", "ת״א" and "Tel Aviv" were three different areas, and
filtering on any one of them found a third of the games. A city is a row
with both names on it now: one thing, however it is written or read.

This router is what the search bar on "join a game" talks to — the list with
a game count beside each name, the city the player last chose, and the alert
for when somebody finally opens one.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/cities", tags=["cities"])

# How far ahead a game counts towards a city's number. The same window the
# open-games list itself uses, so the suggestion and the list agree.
HORIZON = timedelta(days=28)
# How many cities to remember. Three chips is a row; a fourth wraps.
RECENT_LIMIT = 3


def _recent_ids(user: models.User) -> list[int]:
    value = user.recent_city_ids
    return [int(x) for x in value] if isinstance(value, list) else []


@router.get("", response_model=schemas.CitiesOut)
def list_cities(
    sport_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Every city, each with the number of open games in it.

    The count is what sorts the suggestions, so it is computed here rather
    than left to the client: the client has the games of one sport in one
    list, and would count zero for every city it has not loaded."""
    now = datetime.utcnow()
    games = (
        db.query(models.OpenGame)
        .join(models.Venue, models.Venue.id == models.OpenGame.venue_id)
        .filter(
            models.OpenGame.status == models.OpenGameStatus.open,
            models.OpenGame.match_id.is_(None),
            models.OpenGame.starts_at > now,
            models.OpenGame.starts_at < now + HORIZON,
            models.Venue.city_id.isnot(None),
        )
    )
    if sport_id is not None:
        games = games.filter(models.OpenGame.sport_id == sport_id)

    counts: dict[int, int] = {}
    for game in games.all():
        # A full game is not something to join, so it does not make a city
        # look busier than it is.
        if game.is_full:
            continue
        counts[game.venue.city_id] = counts.get(game.venue.city_id, 0) + 1

    cities = db.query(models.City).order_by(models.City.name_he).all()
    return schemas.CitiesOut(
        cities=[
            schemas.CityOut(
                id=c.id, name_he=c.name_he, name_en=c.name_en, games=counts.get(c.id, 0)
            )
            for c in cities
        ],
        selected_id=current_user.last_city_id,
        recent_ids=_recent_ids(current_user),
        notify_open_games=bool(current_user.notify_open_games),
        notify_city_id=current_user.notify_open_games_city_id,
    )


@router.post("/select", response_model=schemas.CitiesOut)
def select_city(
    payload: schemas.SelectCityRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Remember where this player is looking. On the account, not in the
    browser: the phone and the laptop are the same person looking for a game
    in the same place."""
    city = None
    if payload.city_id is not None:
        city = db.get(models.City, payload.city_id)
        if not city:
            raise HTTPException(status_code=404, detail="העיר לא נמצאה")

    current_user.last_city_id = city.id if city else None
    if city:
        # Most recent first, no repeats, and only the last few: the chips are
        # a shortcut back, not a history.
        recent = [city.id] + [i for i in _recent_ids(current_user) if i != city.id]
        current_user.recent_city_ids = recent[:RECENT_LIMIT]
    db.commit()
    db.refresh(current_user)
    return list_cities(sport_id=None, db=db, current_user=current_user)


@router.post("/alert", response_model=schemas.CitiesOut)
def set_open_game_alert(
    payload: schemas.OpenGameAlertRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The one thing an empty list can offer: be told when it stops being
    empty. With a city, only for that city."""
    if payload.city_id is not None and not db.get(models.City, payload.city_id):
        raise HTTPException(status_code=404, detail="העיר לא נמצאה")
    current_user.notify_open_games = payload.enabled
    current_user.notify_open_games_city_id = payload.city_id if payload.enabled else None
    db.commit()
    db.refresh(current_user)
    return list_cities(sport_id=None, db=db, current_user=current_user)
