from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import VAPID_PUBLIC_KEY

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key")
def get_vapid_public_key():
    return {"key": VAPID_PUBLIC_KEY or ""}


@router.post("/subscribe", status_code=204)
def subscribe(
    sub_in: schemas.PushSubscriptionIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = (
        db.query(models.PushSubscription)
        .filter(models.PushSubscription.endpoint == sub_in.endpoint)
        .first()
    )
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = sub_in.keys.p256dh
        existing.auth = sub_in.keys.auth
    else:
        db.add(
            models.PushSubscription(
                user_id=current_user.id,
                endpoint=sub_in.endpoint,
                p256dh=sub_in.keys.p256dh,
                auth=sub_in.keys.auth,
            )
        )
    db.commit()


@router.post("/unsubscribe", status_code=204)
def unsubscribe(
    sub_in: schemas.PushUnsubscribeIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db.query(models.PushSubscription).filter(
        models.PushSubscription.endpoint == sub_in.endpoint,
        models.PushSubscription.user_id == current_user.id,
    ).delete()
    db.commit()
