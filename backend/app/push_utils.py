import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from . import models

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@example.com")

# The app has no per-user timezone, and its whole audience is Hebrew-speaking
# — settings114b.md's quiet-hours picker only makes sense read against a
# single assumed local time, so this is it.
APP_TIMEZONE = ZoneInfo("Asia/Jerusalem")


def _within_quiet_hours(user: models.User) -> bool:
    if not user.quiet_hours_from or not user.quiet_hours_to:
        return False
    try:
        start = datetime.strptime(user.quiet_hours_from, "%H:%M").time()
        end = datetime.strptime(user.quiet_hours_to, "%H:%M").time()
    except ValueError:
        return False
    if start == end:
        return False
    now = datetime.now(APP_TIMEZONE).time()
    if start < end:
        return start <= now < end
    # Overnight window (e.g. 22:00 -> 08:00) wraps past midnight.
    return now >= start or now < end


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


def log_notification(
    db: Session,
    user_id: int,
    body: str,
    *,
    type: str = "update",
    url: str | None = None,
    actor_name: str | None = None,
    league_id: int | None = None,
    match_id: int | None = None,
    read: bool = False,
) -> models.Notification:
    """Write a row to the in-app notification log (notifications155a.md). Use
    it directly for the past-tense line a player's own action leaves behind;
    every push already writes one through notify_user."""
    row = models.Notification(
        user_id=user_id,
        type=type,
        actor_name=actor_name,
        league_id=league_id,
        match_id=match_id,
        body=body,
        url=url,
        read_at=datetime.utcnow() if read else None,
    )
    db.add(row)
    db.commit()
    return row


def resolve_match_notifications(
    db: Session,
    user_id: int,
    match_id: int,
    body: str,
    *,
    league_id: int | None = None,
    actor_name: str | None = None,
) -> None:
    """Called when the viewer acts on a match: the rows that were nagging them
    about it have served their purpose, so they give way to one past-tense line
    ("you confirmed the result against X") at the top of the updates list."""
    db.query(models.Notification).filter(
        models.Notification.user_id == user_id,
        models.Notification.match_id == match_id,
    ).delete(synchronize_session=False)
    log_notification(
        db,
        user_id,
        body,
        type="acted",
        match_id=match_id,
        league_id=league_id,
        actor_name=actor_name,
        read=True,
    )


def notify_user(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    url: str = "/",
    category: str | None = None,
    *,
    type: str = "update",
    actor_name: str | None = None,
    league_id: int | None = None,
    match_id: int | None = None,
) -> None:
    """category gates against the two optional toggles settings114b.md added
    ("time_proposal" -> notify_time_proposals, "round_open" ->
    notify_round_opens); leave it None for the notification types the
    settings screen marks as always-on (result confirmations). Quiet hours
    mute everything regardless of category — it's a single blanket control,
    not a per-type one."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        return

    # The log is written before any of the mute rules below: quiet hours and
    # the per-category toggles silence the phone, not the notifications screen.
    log_notification(
        db,
        user_id,
        body,
        type=type,
        url=url,
        actor_name=actor_name,
        league_id=league_id,
        match_id=match_id,
    )

    if category == "time_proposal" and not user.notify_time_proposals:
        return
    if category == "round_open" and not user.notify_round_opens:
        return
    if _within_quiet_hours(user):
        return

    subscriptions = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user_id).all()
    for subscription in subscriptions:
        if not _send_to_subscription(subscription, title, body, url):
            db.delete(subscription)
    db.commit()
