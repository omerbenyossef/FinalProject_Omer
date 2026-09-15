from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import VAPID_PUBLIC_KEY, _send_to_subscription

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


@router.post("/test", response_model=schemas.MessageOut)
def send_test_push(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Sends one notification to this player's own devices, so whoever set the
    keys up can see for themselves that a push arrives. It goes straight to
    the subscriptions rather than through notify_user: quiet hours and the
    category toggles are there to spare people notifications they didn't ask
    for, and this one was asked for by the person receiving it."""
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=400, detail="התראות עוד לא מוגדרות בשרת")
    subscriptions = (
        db.query(models.PushSubscription)
        .filter(models.PushSubscription.user_id == current_user.id)
        .all()
    )
    if not subscriptions:
        raise HTTPException(status_code=400, detail="המכשיר הזה לא רשום להתראות")

    english = current_user.language == "en"
    title = "Rally"
    body = "Notifications are working." if english else "ההתראות עובדות."
    delivered = 0
    for subscription in subscriptions:
        if _send_to_subscription(subscription, title, body, "/profile"):
            delivered += 1
        else:
            db.delete(subscription)
    db.commit()
    if delivered == 0:
        raise HTTPException(status_code=400, detail="לא הצלחנו לשלוח התראה למכשיר הזה")
    return schemas.MessageOut(message="נשלחה התראת בדיקה")
