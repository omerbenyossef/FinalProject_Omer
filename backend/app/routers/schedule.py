from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user
from ..rating_utils import round_to_half
from .matches import _auto_confirm_overdue, _to_naive_utc

router = APIRouter(prefix="/matches", tags=["schedule"])


def _get_match_for_participant(db: Session, match_id: int, user_id: int) -> models.Match:
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
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if user_id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="Not a participant in this match")
    return match


def _schedule_status(match: models.Match, user_id: int) -> str:
    if match.scheduled_at is None:
        return "no_time"
    if match.schedule_confirmed:
        return "set"
    return "sent" if match.scheduled_by == user_id else "asked_you"


def _default_court(db: Session, match: models.Match) -> str | None:
    """The league's most recently used court, so 107a's COURT field can
    prefill to whatever the league has been playing on."""
    if not match.league_id:
        return None
    recent = (
        db.query(models.Match)
        .filter(
            models.Match.league_id == match.league_id,
            models.Match.court.isnot(None),
            models.Match.id != match.id,
        )
        .order_by(models.Match.id.desc())
        .first()
    )
    return recent.court if recent else None


@router.get("/{match_id}", response_model=schemas.MatchDetailOut)
def get_match_detail(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    match = _get_match_for_participant(db, match_id, current_user.id)
    opponent = match.player2 if match.player1_id == current_user.id else match.player1

    sport_id = match.league.sport_id if match.league_id else match.sport_id
    my_ntrp = opp_ntrp = None
    if sport_id:
        ratings = {
            r.user_id: round_to_half(r.level)
            for r in db.query(models.PlayerRating).filter(
                models.PlayerRating.sport_id == sport_id,
                models.PlayerRating.user_id.in_([current_user.id, opponent.id]),
            )
        }
        my_ntrp = ratings.get(current_user.id)
        opp_ntrp = ratings.get(opponent.id)

    h2h_matches = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.completed,
            or_(
                and_(models.Match.player1_id == current_user.id, models.Match.player2_id == opponent.id),
                and_(models.Match.player1_id == opponent.id, models.Match.player2_id == current_user.id),
            ),
        )
        .order_by(models.Match.played_at.desc())
        .all()
    )
    h2h_wins = h2h_losses = 0
    last_match_sets = None
    for i, m in enumerate(h2h_matches):
        i_am_player1 = m.player1_id == current_user.id
        my_score = m.player1_score if i_am_player1 else m.player2_score
        opp_score = m.player2_score if i_am_player1 else m.player1_score
        if my_score > opp_score:
            h2h_wins += 1
        else:
            h2h_losses += 1
        if i == 0:
            sets = m.sets
            if sets and not i_am_player1:
                sets = [{"player1_games": s["player2_games"], "player2_games": s["player1_games"]} for s in sets]
            last_match_sets = sets

    return schemas.MatchDetailOut(
        id=match.id,
        kind=match.kind,
        opponent=opponent,
        league_id=match.league_id,
        league_name=match.league.name if match.league_id else None,
        round_number=match.round_number,
        schedule_started_at=match.league.schedule_started_at if match.league_id else None,
        round_length_days=match.league.round_length_days if match.league_id else None,
        status=_schedule_status(match, current_user.id),
        scheduled_at=match.scheduled_at,
        scheduled_by=match.scheduled_by,
        schedule_proposed_at=match.schedule_proposed_at,
        court=match.court,
        default_court=_default_court(db, match),
        my_ntrp=my_ntrp,
        opponent_ntrp=opp_ntrp,
        h2h_wins=h2h_wins,
        h2h_losses=h2h_losses,
        last_match_sets=last_match_sets,
    )


@router.post("/{match_id}/schedule", response_model=schemas.MatchOut)
def propose_match_schedule(
    match_id: int,
    proposal: schemas.MatchScheduleProposal,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.kind == models.MatchKind.friendly and match.invite_status != models.FriendlyInviteStatus.accepted:
        raise HTTPException(status_code=400, detail="ההזמנה עדיין לא אושרה")
    if match.status != models.MatchStatus.pending:
        raise HTTPException(status_code=400, detail="אי אפשר לתאם זמן למשחק שכבר דווח")

    scheduled_at = _to_naive_utc(proposal.scheduled_at)
    if scheduled_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="זמן המשחק חייב להיות בעתיד")

    match.scheduled_at = scheduled_at
    match.scheduled_by = current_user.id
    match.schedule_confirmed = False
    match.schedule_proposed_at = datetime.utcnow()
    match.court = proposal.court
    db.commit()
    db.refresh(match)

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    notify_user(
        db,
        opponent_id,
        "הצעת זמן למשחק",
        f"{current_user.name} הציע/ה שעה למשחק שלכם, ומחכה לאישור שלך",
        f"/matches/{match.id}",
    )

    return match


@router.post("/{match_id}/schedule/confirm", response_model=schemas.MatchOut)
def confirm_match_schedule(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.scheduled_at is None:
        raise HTTPException(status_code=400, detail="אין הצעת זמן לאשר")
    if match.schedule_confirmed:
        raise HTTPException(status_code=400, detail="הזמן כבר מאושר")
    if match.scheduled_by == current_user.id:
        raise HTTPException(status_code=400, detail="לא ניתן לאשר הצעת זמן שהצעת בעצמך")

    match.schedule_confirmed = True
    db.commit()
    db.refresh(match)

    notify_user(
        db,
        match.scheduled_by,
        "הזמן למשחק אושר",
        f"{current_user.name} אישר/ה את הזמן שהצעת למשחק שלכם",
        f"/matches/{match.id}",
    )

    return match


@router.post("/{match_id}/schedule/decline", response_model=schemas.MatchOut)
def decline_match_schedule(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.scheduled_at is None:
        raise HTTPException(status_code=400, detail="אין הצעת זמן לבטל")
    if match.schedule_confirmed:
        raise HTTPException(status_code=400, detail="הזמן כבר מאושר")

    other_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    match.scheduled_at = None
    match.scheduled_by = None
    match.schedule_confirmed = False
    match.schedule_proposed_at = None
    match.court = None
    db.commit()
    db.refresh(match)

    notify_user(
        db,
        other_id,
        "הצעת הזמן בוטלה",
        f"{current_user.name} ביטל/ה את הצעת הזמן למשחק שלכם",
        f"/matches/{match.id}/schedule",
    )

    return match
