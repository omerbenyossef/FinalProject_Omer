"""The places people play, and the addresses that book them.

Anyone signed in can read the list — they pick from it when agreeing a time.
Only the admin edits it: a venue carries a booking link, and a link that
opens the wrong court is worse than no link at all.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/venues", tags=["venues"])


def _require_admin(user: models.User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="רק מנהל המערכת יכול לערוך מגרשים")


def _clean_url(url: str | None) -> str | None:
    """A booking link has to be a real absolute address. A bare domain typed
    without a scheme silently becomes a relative path in an href and sends
    the player nowhere — which is exactly the bug that cost a day here."""
    if url is None:
        return None
    url = url.strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    return url


def _out(venue: models.Venue) -> schemas.VenueOut:
    return schemas.VenueOut(
        id=venue.id,
        name=venue.name,
        area=venue.area,
        sport_id=venue.sport_id,
        sport_name=venue.sport.name if venue.sport else None,
        booking_url=venue.booking_url,
    )


@router.get("", response_model=list[schemas.VenueOut])
def list_venues(
    sport_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """With a sport, the venues that host it plus the ones that host
    anything. Without, everything — which is what the admin screen wants."""
    query = db.query(models.Venue).options(joinedload(models.Venue.sport))
    if sport_id is not None:
        query = query.filter(
            or_(models.Venue.sport_id == sport_id, models.Venue.sport_id.is_(None))
        )
    return [_out(v) for v in query.order_by(models.Venue.name).all()]


@router.post("", response_model=schemas.VenueOut)
def create_venue(
    payload: schemas.VenueIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    venue = models.Venue(
        name=payload.name.strip(),
        area=(payload.area or "").strip() or None,
        sport_id=payload.sport_id,
        booking_url=_clean_url(payload.booking_url),
    )
    db.add(venue)
    db.commit()
    db.refresh(venue)
    return _out(venue)


@router.patch("/{venue_id}", response_model=schemas.VenueOut)
def update_venue(
    venue_id: int,
    payload: schemas.VenueIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="המגרש לא נמצא")
    venue.name = payload.name.strip()
    venue.area = (payload.area or "").strip() or None
    venue.sport_id = payload.sport_id
    venue.booking_url = _clean_url(payload.booking_url)
    db.commit()
    db.refresh(venue)
    return _out(venue)


@router.delete("/{venue_id}", status_code=204)
def delete_venue(
    venue_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="המגרש לא נמצא")
    # Matches point at venues. Release them first — Postgres enforces the key
    # and would refuse the delete, and the match itself is still perfectly
    # valid without a venue on the list.
    db.query(models.Match).filter(models.Match.venue_id == venue_id).update(
        {models.Match.venue_id: None}, synchronize_session=False
    )
    db.delete(venue)
    db.commit()
