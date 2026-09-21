"""The two players' conversation about one match.

Every match that is meant to be played has one: a league match from the
moment it is drawn, a friendly once the invitation is accepted. The questions
it exists for — "running late", "which court?", "can we move it an hour?" —
don't care which kind it is.

It closes when the match does. A reported score still waiting on the other
player leaves it open — that is exactly when there is something to say about
it — and so does a dispute. Once the result is confirmed and the match is
settled, the conversation stops taking new messages. It stays readable:
closing a chat is not a reason to destroy what was said in it.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user

router = APIRouter(prefix="/matches", tags=["chat"])

# One push for the first message, then silence while the conversation runs.
# A reply typed a minute later shouldn't buzz again; one picked up an hour
# later should.
CHAT_NOTIFY_COOLDOWN = timedelta(minutes=10)

PREVIEW_CHARS = 90


def _chat_match(db: Session, match_id: int, user: models.User) -> models.Match:
    match = (
        db.query(models.Match)
        .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
        .filter(models.Match.id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="המשחק לא נמצא")
    if user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="אין לך משחק כזה")
    # A friendly nobody has accepted isn't a match yet, and one that was
    # declined or called off isn't one any more.
    if (
        match.kind == models.MatchKind.friendly
        and match.invite_status != models.FriendlyInviteStatus.accepted
    ):
        raise HTTPException(status_code=400, detail="הצ'אט ייפתח אחרי שההזמנה תאושר")
    return match


def _is_open(match: models.Match) -> bool:
    """Open until the match is settled. pending_confirmation and disputed both
    stay open: a score one side is waiting on, or two sides disagree about, is
    the most likely thing they need to talk about."""
    return match.status != models.MatchStatus.completed


def _opponent(match: models.Match, user_id: int) -> models.User | None:
    return match.player2 if match.player1_id == user_id else match.player1


def _to_out(message: models.MatchMessage, user_id: int) -> schemas.MatchMessageOut:
    return schemas.MatchMessageOut(
        id=message.id,
        sender_id=message.sender_id,
        sender_name=message.sender.name if message.sender else "",
        sender_photo_url=message.sender.photo_url if message.sender else None,
        body=message.body,
        created_at=message.created_at,
        mine=message.sender_id == user_id,
    )


def _mark_read(db: Session, match_id: int, user_id: int) -> None:
    row = (
        db.query(models.MatchChatRead)
        .filter(
            models.MatchChatRead.match_id == match_id,
            models.MatchChatRead.user_id == user_id,
        )
        .first()
    )
    if row is None:
        row = models.MatchChatRead(match_id=match_id, user_id=user_id)
        db.add(row)
    row.last_read_at = datetime.utcnow()
    db.commit()


def unread_count(db: Session, match_id: int, user_id: int) -> int:
    """How many of the opponent's messages arrived after this player last
    opened the chat. Read by the match screen to put a dot on the entry."""
    row = (
        db.query(models.MatchChatRead)
        .filter(
            models.MatchChatRead.match_id == match_id,
            models.MatchChatRead.user_id == user_id,
        )
        .first()
    )
    query = db.query(models.MatchMessage).filter(
        models.MatchMessage.match_id == match_id,
        models.MatchMessage.sender_id != user_id,
    )
    if row and row.last_read_at:
        query = query.filter(models.MatchMessage.created_at > row.last_read_at)
    return query.count()


@router.get("/{match_id}/chat", response_model=schemas.MatchChatOut)
def get_chat(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _chat_match(db, match_id, current_user)
    messages = (
        db.query(models.MatchMessage)
        .options(joinedload(models.MatchMessage.sender))
        .filter(models.MatchMessage.match_id == match_id)
        .order_by(models.MatchMessage.id)
        .all()
    )
    # Opening the chat is what marks it read — there is no other moment that
    # honestly means "I have seen this".
    _mark_read(db, match_id, current_user.id)
    return schemas.MatchChatOut(
        match_id=match.id,
        opponent=_opponent(match, current_user.id),
        can_send=_is_open(match),
        messages=[_to_out(m, current_user.id) for m in messages],
    )


@router.post("/{match_id}/chat", response_model=schemas.MatchMessageOut)
def send_message(
    match_id: int,
    payload: schemas.MatchMessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _chat_match(db, match_id, current_user)
    if not _is_open(match):
        raise HTTPException(status_code=400, detail="המשחק נסגר, והצ'אט איתו")
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="אין מה לשלוח")

    message = models.MatchMessage(match_id=match.id, sender_id=current_user.id, body=body)
    db.add(message)
    db.commit()
    db.refresh(message)

    # Sending is also reading: the sender has obviously seen everything above
    # their own message.
    _mark_read(db, match.id, current_user.id)

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    recent = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == opponent_id,
            models.Notification.match_id == match.id,
            models.Notification.type == "chat_message",
            models.Notification.created_at > datetime.utcnow() - CHAT_NOTIFY_COOLDOWN,
        )
        .first()
    )
    if not recent:
        preview = body if len(body) <= PREVIEW_CHARS else body[: PREVIEW_CHARS - 1] + "…"
        notify_user(
            db,
            opponent_id,
            "הודעה חדשה",
            f"{current_user.name}: {preview}",
            f"/matches/{match.id}/chat",
            type="chat_message",
            actor_name=current_user.name,
            league_id=match.league_id,
            match_id=match.id,
            title_en="New message",
            body_en=f"{current_user.name}: {preview}",
        )

    return _to_out(message, current_user.id)
