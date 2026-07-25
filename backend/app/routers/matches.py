from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/leagues/{league_id}/matches", tags=["matches"])


def _require_member(db: Session, league_id: int, user_id: int) -> None:
    membership = (
        db.query(models.LeagueMembership)
        .filter(
            models.LeagueMembership.league_id == league_id,
            models.LeagueMembership.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="You must join the league first")


@router.get("/", response_model=list[schemas.MatchOut])
def list_matches(
    league_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
        .filter(
            models.Match.league_id == league_id,
            or_(
                models.Match.player1_id == current_user.id,
                models.Match.player2_id == current_user.id,
            ),
        )
        .order_by(models.Match.created_at.desc())
        .all()
    )
    return matches


@router.post("/", response_model=schemas.MatchOut)
def create_match(
    league_id: int,
    match_in: schemas.MatchCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if match_in.opponent_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot challenge yourself")

    _require_member(db, league_id, current_user.id)
    _require_member(db, league_id, match_in.opponent_id)

    match = models.Match(
        league_id=league_id,
        player1_id=current_user.id,
        player2_id=match_in.opponent_id,
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return match


@router.post("/{match_id}/score", response_model=schemas.MatchOut)
def report_score(
    league_id: int,
    match_id: int,
    score_in: schemas.MatchScoreUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = (
        db.query(models.Match)
        .filter(models.Match.id == match_id, models.Match.league_id == league_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="Not a participant in this match")

    match.player1_score = score_in.player1_score
    match.player2_score = score_in.player2_score
    match.status = models.MatchStatus.completed
    match.played_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    return match
