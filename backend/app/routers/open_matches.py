"""open-matches-156a.md — matches from rounds that have closed and still
haven't been settled.

The one question this screen answers is *who is holding this up and what can I
do about it*, so the split into waiting_on_you / waiting_on_them is made here
and the client never works it out for itself. The sentences come from the
spec's wording table, finished, with a single {score} placeholder the client
fills in as an isolated LTR run.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user
from .leagues import _round_ends_at
from .matches import _auto_confirm_overdue

router = APIRouter(prefix="/matches", tags=["open-matches"])

# A friendly has no round to close, so it counts as open business once its
# scheduled time is a week gone (same threshold the home carousel uses).
FRIENDLY_STALE = timedelta(days=7)
REMIND_COOLDOWN = timedelta(hours=24)


def _sets_label(sets, flip: bool) -> str | None:
    if not sets:
        return None
    if flip:
        sets = [{"player1_games": s["player2_games"], "player2_games": s["player1_games"]} for s in sets]
    return " ".join(f"{s['player1_games']}-{s['player2_games']}" for s in sets)


def _winner_is_me(sets, i_am_player1: bool) -> bool | None:
    if not sets:
        return None
    p1 = sum(1 for s in sets if s["player1_games"] > s["player2_games"])
    p2 = sum(1 for s in sets if s["player2_games"] > s["player1_games"])
    if p1 == p2:
        return None
    return (p1 > p2) if i_am_player1 else (p2 > p1)


def _days_since(value: datetime | None) -> int | None:
    if value is None:
        return None
    return max(0, (datetime.utcnow() - value).days)


def _days_phrase(days: int | None) -> str:
    if days is None:
        return ""
    if days <= 0:
        return " — נשלח היום."
    if days == 1:
        return " — נשלח לפני יום."
    if days == 2:
        return " — נשלח לפני יומיים."
    return f" — נשלח לפני {days} ימים."


def _is_open(match: models.Match) -> bool:
    """Has this match's own window closed, so that it is leftover business
    rather than this week's?"""
    now = datetime.utcnow()
    if match.kind == models.MatchKind.friendly:
        if match.scheduled_at is None:
            return match.created_at is not None and now - match.created_at > FRIENDLY_STALE
        return now - match.scheduled_at > FRIENDLY_STALE
    ends_at = _round_ends_at(match.league, match.round_number)
    return ends_at is not None and ends_at < now


def _item(match: models.Match, user_id: int) -> tuple[str, schemas.OpenMatchItemOut] | None:
    """(bucket, item) or None when the match isn't open business for this
    viewer. bucket is "you" or "them"."""
    i_am_player1 = match.player1_id == user_id
    opponent = match.player2 if i_am_player1 else match.player1
    name = opponent.name if opponent else ""
    mine_first = _sets_label(match.sets, not i_am_player1)
    corrected_first = _sets_label(match.corrected_sets, not i_am_player1)

    common = dict(
        match_id=match.id,
        opponent_name=name,
        league_name=match.league.name if match.league_id else None,
        round=match.round_number,
        played_on=match.scheduled_at or match.played_at,
        reminder_sent_at=match.manual_reminded_at,
    )

    if match.status == models.MatchStatus.pending_confirmation:
        not_played_claim = match.void_reason == "not_played" and match.corrected_sets is None
        days = _days_since(match.played_at or match.disputed_at)

        if not_played_claim:
            if match.reported_by == user_id:
                return (
                    "them",
                    schemas.OpenMatchItemOut(
                        **common,
                        state="not_played_reported",
                        days_waiting=days,
                        body=f"דיווחת שהמשחק לא שוחק. מחכים לאישור של {name}{_days_phrase(days)}",
                    ),
                )
            return (
                "you",
                schemas.OpenMatchItemOut(
                    **common,
                    state="awaiting_my_confirm",
                    days_waiting=days,
                    body=f"{name} דיווח/ה שהמשחק לא שוחק. צריך שתאשר שזה מה שקרה.",
                ),
            )

        if match.corrected_sets is not None:
            if match.corrected_by == user_id:
                return (
                    "them",
                    schemas.OpenMatchItemOut(
                        **common,
                        state="correction_sent",
                        score=corrected_first,
                        days_waiting=_days_since(match.disputed_at),
                        body=f"שלחת תיקון ל־{{score}}. מחכים לאישור של {name}.",
                    ),
                )
            return (
                "you",
                schemas.OpenMatchItemOut(
                    **common,
                    state="awaiting_my_confirm",
                    score=corrected_first,
                    days_waiting=_days_since(match.disputed_at),
                    body=f"{name} שלח/ה תיקון ל־{{score}}. צריך שתאשר שזו התוצאה.",
                ),
            )

        i_won = _winner_is_me(match.sets, i_am_player1)
        if match.reported_by == user_id:
            opening = "דיווחת ניצחון {score}." if i_won else "דיווחת הפסד {score}."
            return (
                "them",
                schemas.OpenMatchItemOut(
                    **common,
                    state="awaiting_their_confirm",
                    score=mine_first,
                    days_waiting=days,
                    body=f"{opening} מחכים לאישור של {name}.",
                ),
            )
        opening = (
            f"{name} דיווח/ה שניצחת {{score}}."
            if i_won
            else f"{name} דיווח/ה ניצחון {{score}}."
        )
        return (
            "you",
            schemas.OpenMatchItemOut(
                **common,
                state="awaiting_my_confirm",
                score=mine_first,
                days_waiting=days,
                body=f"{opening} צריך שתאשר שזו התוצאה.",
            ),
        )

    if match.status == models.MatchStatus.disputed and match.void_reason != "not_played":
        return (
            "you",
            schemas.OpenMatchItemOut(
                **common,
                state="disputed",
                my_score=mine_first,
                their_score=_sets_label(match.corrected_sets, not i_am_player1),
                days_waiting=_days_since(match.disputed_at),
                body="שניכם דיווחתם תוצאות שונות, ולכן המשחק לא נספר בטבלה.",
            ),
        )

    if match.status == models.MatchStatus.pending:
        return (
            "you",
            schemas.OpenMatchItemOut(
                **common,
                state="unreported",
                days_waiting=_days_since(match.scheduled_at),
                body="המחזור נסגר בלי שהמשחק שוחק. דווח מה קרה.",
            ),
        )

    return None


@router.get("/open", response_model=schemas.OpenMatchesOut)
def list_open_matches(
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
        )
        .filter(
            models.Match.status.in_(
                [
                    models.MatchStatus.pending,
                    models.MatchStatus.pending_confirmation,
                    models.MatchStatus.disputed,
                ]
            ),
            mine,
        )
        .all()
    )

    you: list[schemas.OpenMatchItemOut] = []
    them: list[schemas.OpenMatchItemOut] = []
    for match in matches:
        if match.kind == models.MatchKind.friendly and match.invite_status != models.FriendlyInviteStatus.accepted:
            continue
        if not _is_open(match):
            continue
        result = _item(match, current_user.id)
        if not result:
            continue
        bucket, item = result
        (you if bucket == "you" else them).append(item)

    # Oldest first in both: the longest-open match is the one that needs
    # closing most.
    you.sort(key=lambda i: (i.played_on or datetime.max))
    them.sort(key=lambda i: (i.played_on or datetime.max))
    return schemas.OpenMatchesOut(waiting_on_you=you, waiting_on_them=them)


@router.post("/{match_id}/remind", response_model=schemas.OpenMatchItemOut)
def remind_opponent(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """One manual nudge per match per day, whoever the opponent is waiting
    on. Returns the item so the row can re-render with its new stamp."""
    match = (
        db.query(models.Match)
        .options(
            joinedload(models.Match.player1),
            joinedload(models.Match.player2),
            joinedload(models.Match.league),
        )
        .filter(models.Match.id == match_id)
        .first()
    )
    if not match or current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=404, detail="המשחק לא נמצא")
    if match.manual_reminded_at and datetime.utcnow() - match.manual_reminded_at < REMIND_COOLDOWN:
        raise HTTPException(status_code=429, detail="אפשר לשלוח תזכורת אחת ביום")

    result = _item(match, current_user.id)
    if not result or result[0] != "them":
        raise HTTPException(status_code=400, detail="אין על מה להזכיר במשחק הזה")

    match.manual_reminded_at = datetime.utcnow()
    db.commit()
    db.refresh(match)

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    notify_user(
        db,
        opponent_id,
        "תזכורת מהיריב",
        f"{current_user.name} מחכה לתשובה שלך על המשחק שלכם",
        f"/matches/{match.id}",
        type="manual_reminder",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
    )

    return _item(match, current_user.id)[1]
