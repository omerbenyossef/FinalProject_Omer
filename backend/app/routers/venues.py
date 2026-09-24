"""The places people play, and the addresses that book them.

Anyone signed in can read the list — they pick from it when agreeing a time.
Only the admin edits it: a venue carries a booking link, and a link that
opens the wrong court is worse than no link at all.
"""

import base64
import binascii
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from .auth import _decode_data_url

# The browser scales a venue picture to a 1200px-wide JPEG before sending it,
# which lands well under this. Anything much bigger is a client that skipped
# that step, and every venue read would carry the weight.
MAX_VENUE_IMAGE_BYTES = 1024 * 1024

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
        image_url=venue.image_url,
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


@router.get("/{venue_id}/image")
def venue_image(venue_id: int, db: Session = Depends(get_db)):
    """The picture on its own, so a venue's details and its photograph don't
    have to travel together in every list. The URL carries the stamp of the
    picture it points at, so the answer can be cached for as long as the
    browser likes. No sign-in: it is a photograph of a public tennis court."""
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue or not venue.image:
        raise HTTPException(status_code=404, detail="אין תמונה למגרש הזה")
    prefix, _, payload = venue.image.partition(",")
    media_type = prefix[len("data:") : -len(";base64")] or "image/jpeg"
    try:
        raw = base64.b64decode(payload)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=404, detail="אין תמונה למגרש הזה")
    return Response(
        content=raw,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.post("/{venue_id}/image", response_model=schemas.VenueOut)
def set_venue_image(
    venue_id: int,
    payload: schemas.VenueImageIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Admin only, like everything else that edits a venue. A picture on the
    picker is a claim about a real place, and a wrong one misleads exactly as
    much as a wrong booking link."""
    _require_admin(current_user)
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="המגרש לא נמצא")
    media_type, raw = _decode_data_url(payload.data_url, MAX_VENUE_IMAGE_BYTES)
    # Re-encoded from the bytes that were validated, so what gets stored is
    # only ever something this endpoint could decode.
    venue.image = f"data:{media_type};base64," + base64.b64encode(raw).decode()
    venue.image_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(venue)
    return _out(venue)


@router.delete("/{venue_id}/image", response_model=schemas.VenueOut)
def delete_venue_image(
    venue_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="המגרש לא נמצא")
    venue.image = None
    venue.image_updated_at = None
    db.commit()
    db.refresh(venue)
    return _out(venue)
