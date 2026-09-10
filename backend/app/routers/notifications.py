"""notifications155a.md — the notifications screen's payload.

The screen has two halves and they come from two different places on purpose:

* "needs you" is **derived** from live match state every time the screen is
  opened, so a card can never outlive the thing it points at (the round
  closed, the opponent cancelled, someone else confirmed).
* "updates" is the stored log (models.Notification), which is what push
  notifications and the viewer's own finished actions leave behind.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from .matches import _auto_confirm_overdue

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Card types, matching the spec's mono labels one for one.
RESULT_TO_CONFIRM = "RESULT TO CONFIRM"
TIME_PROPOSED = "TIME PROPOSED"
MATCH_TO_REPORT = "MATCH TO REPORT"
ROUND_CLOSES = "ROUND CLOSES"

# How close the end of the round has to be before an unscheduled match starts
# asking for a time.
ROUND_CLOSES_WINDOW = timedelta(days=3)


def _score_label(sets) -> str | None:
    if not sets:
        return None
    return " ".join(f"{s['player1_games']}-{s['player2_games']}" for s in sets)


def _week_end_saturday(dt: datetime) -> datetime:
    js_day = (dt.weekday() + 1) % 7
    return dt + timedelta(days=(6 - js_day + 7) % 7)


def _round_ends_at(league: models.League, round_number: int | None) -> datetime | None:
    """Same convention as the frontend's roundDueDateObj: round 1 ends on the
    first Saturday after the schedule started, each later round one round
    length after that."""
    if not league or not league.schedule_started_at or not round_number:
        return None
    first_end = _week_end_saturday(league.schedule_started_at)
    return first_end + timedelta(days=(league.round_length_days or 7) * (round_number - 1))


def _opponent(match: models.Match, user_id: int) -> models.User:
    return match.player2 if match.player1_id == user_id else match.player1


def _card(match: models.Match, user_id: int, league: models.League | None) -> schemas.NotificationItemOut | None:
    """The one open thing this match is asking of this viewer, if any."""
    opponent = _opponent(match, user_id)
    name = opponent.name if opponent else ""
    league_id = match.league_id
    now = datetime.utcnow()

    if match.status == models.MatchStatus.pending_confirmation:
        if match.void_reason == "not_played" and match.corrected_sets is None:
            if match.reported_by == user_id:
                return None
            return schemas.NotificationItemOut(
                id=f"match:{match.id}:confirm",
                type=RESULT_TO_CONFIRM,
                actor_name=name,
                league_id=league_id,
                match_id=match.id,
                body=f"{name} מדווח/ת שהמשחק שלכם לא התקיים, ומחכה לתשובה שלך",
                body_en=f"{name} says the match never happened, and is waiting for your answer",
                created_at=match.schedule_proposed_at or match.created_at,
            )
        if match.corrected_sets is not None:
            if match.corrected_by == user_id:
                return None
            return schemas.NotificationItemOut(
                id=f"match:{match.id}:confirm",
                type=RESULT_TO_CONFIRM,
                actor_name=name,
                league_id=league_id,
                match_id=match.id,
                body=f"{name} מבקש/ת לתקן את התוצאה ל־{{score}}, ומחכה לתשובה שלך",
                body_en=f"{name} wants to correct the score to {{score}}, and is waiting for your answer",
                score=_score_label(match.corrected_sets),
                created_at=match.disputed_at or match.created_at,
            )
        if match.reported_by == user_id:
            return None
        return schemas.NotificationItemOut(
            id=f"match:{match.id}:confirm",
            type=RESULT_TO_CONFIRM,
            actor_name=name,
            league_id=league_id,
            match_id=match.id,
            body=f"{name} דיווח/ה {{score}} במשחק שלכם, ומחכה לאישור שלך",
            body_en=f"{name} reported {{score}} in your match, and is waiting for you to confirm",
            score=_score_label(match.sets),
            created_at=match.played_at or match.created_at,
        )

    if match.status != models.MatchStatus.pending:
        return None

    if not match.scheduled_at:
        # Nothing agreed yet. It only becomes a call to action once the round
        # is actually closing in on them.
        ends_at = _round_ends_at(league, match.round_number)
        if not ends_at or ends_at - now > ROUND_CLOSES_WINDOW or ends_at < now:
            return None
        return schemas.NotificationItemOut(
            id=f"match:{match.id}:round",
            type=ROUND_CLOSES,
            actor_name=name,
            league_id=league_id,
            match_id=match.id,
            body=f"{name} — עוד לא קבעתם זמן והמחזור נסגר ב־{{time}}",
            body_en=f"{name} — you have no time set and the round closes {{time}}",
            time=ends_at,
            created_at=match.created_at,
        )

    if not match.schedule_confirmed:
        if match.scheduled_by == user_id:
            return None
        count = len(match.time_options)
        if count > 1:
            body = f"{name} הציע/ה {{count}} זמנים למשחק שלכם"
            body_en = f"{name} proposed {{count}} times for your match"
            time = None
        else:
            body = f"{name} הציע/ה לשחק ב־{{time}}"
            body_en = f"{name} proposed playing at {{time}}"
            time = match.scheduled_at
        return schemas.NotificationItemOut(
            id=f"match:{match.id}:time",
            type=TIME_PROPOSED,
            actor_name=name,
            league_id=league_id,
            match_id=match.id,
            body=body,
            body_en=body_en,
            time=time,
            count=count if count > 1 else None,
            created_at=match.schedule_proposed_at or match.created_at,
        )

    if match.scheduled_at <= now:
        return schemas.NotificationItemOut(
            id=f"match:{match.id}:report",
            type=MATCH_TO_REPORT,
            actor_name=name,
            league_id=league_id,
            match_id=match.id,
            body=f"{name} — המשחק שלכם ב־{{time}} עבר ואין לו תוצאה",
            body_en=f"{name} — your match at {{time}} has passed with no result",
            time=match.scheduled_at,
            created_at=match.scheduled_at,
        )

    return None


TYPE_ORDER = {RESULT_TO_CONFIRM: 0, TIME_PROPOSED: 1, MATCH_TO_REPORT: 2, ROUND_CLOSES: 3}


@router.get("", response_model=schemas.NotificationsOut)
def list_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)

    mine = or_(
        models.Match.player1_id == current_user.id,
        models.Match.player2_id == current_user.id,
    )
    matches = (
        db.query(models.Match)
        .options(
            joinedload(models.Match.player1),
            joinedload(models.Match.player2),
            joinedload(models.Match.league),
            joinedload(models.Match.time_options),
        )
        .filter(
            models.Match.status.in_(
                [models.MatchStatus.pending, models.MatchStatus.pending_confirmation]
            ),
            mine,
        )
        .all()
    )

    action_required = []
    for match in matches:
        if match.kind == models.MatchKind.friendly and match.invite_status != models.FriendlyInviteStatus.accepted:
            continue
        card = _card(match, current_user.id, match.league)
        if card:
            action_required.append(card)
    action_required.sort(key=lambda c: (TYPE_ORDER.get(c.type, 9), c.created_at or datetime.max))

    # A stored row about a match that is still asking for something would say
    # the same thing twice, one section apart.
    open_match_ids = {c.match_id for c in action_required}
    rows = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == current_user.id)
        .order_by(models.Notification.created_at.desc(), models.Notification.id.desc())
        .limit(80)
        .all()
    )
    updates = [
        schemas.NotificationItemOut(
            id=str(row.id),
            type=row.type,
            actor_name=row.actor_name,
            league_id=row.league_id,
            match_id=row.match_id,
            body=row.body,
            created_at=row.created_at,
            read_at=row.read_at,
        )
        for row in rows
        if row.match_id is None or row.match_id not in open_match_ids
    ]

    return schemas.NotificationsOut(
        action_required=action_required,
        updates=updates,
        # The bell counts what needs doing, not everything unseen.
        unread_count=len(action_required),
    )


@router.post("/read", response_model=schemas.MessageOut)
def mark_read(
    payload: schemas.MarkNotificationsReadRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ids = [int(x) for x in payload.ids if str(x).isdigit()]
    if ids:
        now = datetime.utcnow()
        for row in (
            db.query(models.Notification)
            .filter(
                models.Notification.user_id == current_user.id,
                models.Notification.id.in_(ids),
                models.Notification.read_at.is_(None),
            )
            .all()
        ):
            row.read_at = now
        db.commit()
    return schemas.MessageOut(message="ok")


@router.post("/read-all", response_model=schemas.MessageOut)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Updates only — a card that still needs an action is untouched by this,
    because it isn't stored in the first place."""
    now = datetime.utcnow()
    for row in (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == current_user.id,
            models.Notification.read_at.is_(None),
        )
        .all()
    ):
        row.read_at = now
    db.commit()
    return schemas.MessageOut(message="ok")
