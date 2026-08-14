import random
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user

router = APIRouter(prefix="/leagues/{league_id}/matches", tags=["matches"])

CONFIRMATION_WINDOW = timedelta(hours=48)


def _auto_confirm_overdue(db: Session) -> None:
    """Opportunistic sweep run on every match read: there's no background
    scheduler, so a match past its auto_confirm_at is finalized lazily the
    next time anyone looks at match data, instead of on a timer."""
    now = datetime.utcnow()
    overdue = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.pending_confirmation,
            models.Match.auto_confirm_at.isnot(None),
            models.Match.auto_confirm_at <= now,
        )
        .all()
    )
    for match in overdue:
        match.status = models.MatchStatus.completed
        match.confirmed_by = None
        match.confirmed_at = now
    if overdue:
        db.commit()


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
    _auto_confirm_overdue(db)
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
    _auto_confirm_overdue(db)
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

    if created:
        for member_id in member_ids:
            if member_id == current_user.id:
                continue
            notify_user(
                db,
                member_id,
                "לוח משחקים חדש",
                f"נוצר לוח משחקים חדש בליגה {league.name}",
                f"/leagues/{league_id}",
            )

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
    _auto_confirm_overdue(db)
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
    best_of = match.league.best_of or 3
    if len(score_in.sets) > best_of:
        raise HTTPException(status_code=400, detail=f"אפשר לדווח עד {best_of} סטים בליגה הזו")

    was_reported = match.status != models.MatchStatus.pending
    match.sets = [s.model_dump() for s in score_in.sets]
    match.player1_score = sum(1 for s in score_in.sets if s.player1_games > s.player2_games)
    match.player2_score = sum(1 for s in score_in.sets if s.player2_games > s.player1_games)
    if not was_reported:
        match.played_at = datetime.utcnow()
    match.status = models.MatchStatus.pending_confirmation
    match.reported_by = current_user.id
    match.confirmed_by = None
    match.confirmed_at = None
    match.auto_confirm_at = datetime.utcnow() + CONFIRMATION_WINDOW
    db.commit()
    db.refresh(match)

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    notify_user(
        db,
        opponent_id,
        "יש תוצאה לאישור",
        f"{current_user.name} דיווח תוצאה למשחק שלכם, ומחכה לאישור שלך",
        f"/leagues/{league_id}",
    )

    return match


@router.post("/{match_id}/confirm", response_model=schemas.MatchOut)
def confirm_score(
    league_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    match = (
        db.query(models.Match)
        .filter(models.Match.id == match_id, models.Match.league_id == league_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="Not a participant in this match")
    if match.status != models.MatchStatus.pending_confirmation:
        raise HTTPException(status_code=400, detail="אין תוצאה שממתינה לאישור עבור המשחק הזה")
    if match.reported_by == current_user.id:
        raise HTTPException(status_code=400, detail="לא ניתן לאשר תוצאה שדיווחת בעצמך")

    match.status = models.MatchStatus.completed
    match.confirmed_by = current_user.id
    match.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(match)

    if match.reported_by is not None:
        notify_user(
            db,
            match.reported_by,
            "התוצאה שלך אושרה",
            f"{current_user.name} אישר/ה את התוצאה שדיווחת",
            f"/leagues/{league_id}",
        )

    return match


@router.post("/{match_id}/remind", status_code=status.HTTP_204_NO_CONTENT)
def remind_score(
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
    if match.status not in (models.MatchStatus.pending, models.MatchStatus.pending_confirmation):
        raise HTTPException(status_code=400, detail="אין מה להזכיר במשחק הזה")

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    if match.status == models.MatchStatus.pending_confirmation:
        title, body = "תזכורת: יש תוצאה לאישור", f"{current_user.name} מזכיר/ה לך לאשר את התוצאה שדווחה"
    else:
        title, body = "תזכורת למשחק", f"{current_user.name} מזכיר/ה לך לשחק ולדווח את המשחק שלכם"
    notify_user(db, opponent_id, title, body, f"/leagues/{league_id}")

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
