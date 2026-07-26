import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/leagues/{league_id}/matches", tags=["matches"])


def _round_robin_rounds(player_ids: list[int]) -> list[list[tuple[int, int]]]:
    """Circle-method round robin: each round pairs every player with exactly
    one opponent (one player sits out a round if the count is odd), so a
    "round" maps naturally to "everyone's match for that week"."""
    players = list(player_ids)
    if len(players) % 2 == 1:
        players.append(None)

    n = len(players)
    rounds = []
    for _ in range(n - 1):
        pairs = []
        for i in range(n // 2):
            p1, p2 = players[i], players[n - 1 - i]
            if p1 is not None and p2 is not None:
                pairs.append((p1, p2))
        rounds.append(pairs)
        players = [players[0]] + [players[-1]] + players[1:-1]
    return rounds


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


@router.get("/all", response_model=list[schemas.MatchOut])
def list_all_matches(league_id: int, db: Session = Depends(get_db)):
    matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
        .filter(models.Match.league_id == league_id)
        .order_by(models.Match.created_at.desc())
        .all()
    )
    return matches


@router.post("/generate-schedule", response_model=list[schemas.MatchOut])
def generate_schedule(
    league_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    league = db.query(models.League).filter(models.League.id == league_id).first()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if league.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="רק יוצר הליגה יכול ליצור לוח משחקים")

    member_ids = [
        m.user_id
        for m in db.query(models.LeagueMembership)
        .filter(models.LeagueMembership.league_id == league_id)
        .order_by(models.LeagueMembership.id)
        .all()
    ]
    if len(member_ids) < 2:
        raise HTTPException(status_code=400, detail="צריך לפחות 2 שחקנים כדי ליצור לוח משחקים")

    existing_matches = db.query(models.Match).filter(models.Match.league_id == league_id).all()
    existing_pairs = {frozenset((m.player1_id, m.player2_id)) for m in existing_matches}
    max_existing_round = max((m.round_number or 0 for m in existing_matches), default=0)

    random.shuffle(member_ids)
    ideal_rounds = _round_robin_rounds(member_ids)

    created = []
    next_round_number = max_existing_round + 1
    for round_pairs in ideal_rounds:
        new_pairs = [pair for pair in round_pairs if frozenset(pair) not in existing_pairs]
        if not new_pairs:
            continue
        for p1, p2 in new_pairs:
            a, b = (p1, p2) if random.random() < 0.5 else (p2, p1)
            match = models.Match(
                league_id=league_id, player1_id=a, player2_id=b, round_number=next_round_number
            )
            db.add(match)
            created.append(match)
        next_round_number += 1

    if league.schedule_started_at is None:
        league.schedule_started_at = datetime.utcnow()

    db.commit()
    for match in created:
        db.refresh(match)
    return created


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
    if not score_in.sets:
        raise HTTPException(status_code=400, detail="צריך לדווח לפחות סט אחד")

    match.sets = [s.model_dump() for s in score_in.sets]
    match.player1_score = sum(1 for s in score_in.sets if s.player1_games > s.player2_games)
    match.player2_score = sum(1 for s in score_in.sets if s.player2_games > s.player1_games)
    match.status = models.MatchStatus.completed
    match.played_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    return match


@router.delete("/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_match(
    league_id: int,
    match_id: int,
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
    if match.status != models.MatchStatus.pending:
        raise HTTPException(status_code=400, detail="אי אפשר לבטל משחק שכבר דווח")

    db.delete(match)
    db.commit()
