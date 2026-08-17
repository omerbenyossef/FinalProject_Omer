from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from .matches import _auto_confirm_overdue

router = APIRouter(prefix="/players", tags=["players"])


@router.get("/{opponent_id}/head-to-head", response_model=schemas.HeadToHeadOut)
def head_to_head(
    opponent_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    opponent = db.query(models.User).filter(models.User.id == opponent_id).first()
    if not opponent:
        raise HTTPException(status_code=404, detail="Player not found")

    matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.league))
        .filter(
            models.Match.status == models.MatchStatus.completed,
            or_(
                and_(
                    models.Match.player1_id == current_user.id,
                    models.Match.player2_id == opponent_id,
                ),
                and_(
                    models.Match.player1_id == opponent_id,
                    models.Match.player2_id == current_user.id,
                ),
            ),
        )
        .order_by(models.Match.played_at.desc())
        .all()
    )

    wins = 0
    losses = 0
    match_list = []
    for m in matches:
        i_am_player1 = m.player1_id == current_user.id
        my_score = m.player1_score if i_am_player1 else m.player2_score
        opponent_score = m.player2_score if i_am_player1 else m.player1_score

        sets = m.sets
        if sets and not i_am_player1:
            sets = [
                {"player1_games": s["player2_games"], "player2_games": s["player1_games"]}
                for s in sets
            ]

        if my_score > opponent_score:
            wins += 1
        else:
            losses += 1

        match_list.append(
            schemas.HeadToHeadMatch(
                id=m.id,
                kind=m.kind,
                league_id=m.league_id,
                league_name=m.league.name if m.league_id else None,
                my_score=my_score,
                opponent_score=opponent_score,
                sets=sets,
                played_at=m.played_at,
            )
        )

    return schemas.HeadToHeadOut(opponent=opponent, wins=wins, losses=losses, matches=match_list)
