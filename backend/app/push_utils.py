import json
import os

from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from . import models

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@example.com")


def _send_to_subscription(subscription: models.PushSubscription, title: str, body: str, url: str) -> bool:
    """Returns False if the subscription is gone and should be deleted, True otherwise."""
    if not VAPID_PRIVATE_KEY:
        print(f"[dev] push to {subscription.endpoint[:60]}: {title} - {body}")
        return True

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUBJECT},
        )
        return True
    except WebPushException as e:
        status = e.response.status_code if e.response is not None else None
        print(f"[webpush] failed for {subscription.endpoint[:60]}: {e}")
        return status not in (404, 410)


def notify_user(db: Session, user_id: int, title: str, body: str, url: str = "/") -> None:
    subscriptions = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user_id).all()
    for subscription in subscriptions:
        if not _send_to_subscription(subscription, title, body, url):
            db.delete(subscription)
    db.commit()
