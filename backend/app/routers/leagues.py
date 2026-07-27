import random
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/leagues", tags=["leagues"])


def _generate_join_code(db: Session) -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        exists = db.query(models.League).filter(models.League.join_code == code).first()
        if not exists:
            return code


def _to_league_out(league: models.League) -> schemas.LeagueOut:
    out = schemas.LeagueOut.model_validate(league)
    out.member_count = len(league.memberships)
    return out


@router.get("/", response_model=list[schemas.LeagueOut])
def list_leagues(db: Session = Depends(get_db)):
    leagues = (
        db.query(models.League)
        .options(joinedload(models.League.sport), joinedload(models.League.memberships))
        .order_by(models.League.created_at.desc())
        .all()
    )
    return [_to_league_out(l) for l in leagues]


@router.post("/", response_model=schemas.LeagueOut)
def create_league(
    league_in: schemas.LeagueCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sport = db.query(models.Sport).filter(models.Sport.id == league_in.sport_id).first()
    if not sport:
        raise HTTPException(status_code=404, detail="Sport not found")

    if league_in.is_open and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="רק המנהל יכול ליצור ליגה פתוחה")

    league = models.League(
        name=league_in.name,
        description=league_in.description,
        sport_id=league_in.sport_id,
        created_by=current_user.id,
        join_code=None if league_in.is_open else _generate_join_code(db),
    )
    db.add(league)
    db.commit()
    db.refresh(league)

    membership = models.LeagueMembership(league_id=league.id, user_id=current_user.id)
    db.add(membership)
    db.commit()
    db.refresh(league)

    return _to_league_out(league)


def _get_league_or_404(db: Session, league_id: int) -> models.League:
    league = (
        db.query(models.League)
        .options(joinedload(models.League.sport), joinedload(models.League.memberships))
        .filter(models.League.id == league_id)
        .first()
    )
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    return league


@router.get("/{league_id}", response_model=schemas.LeagueOut)
def get_league(league_id: int, db: Session = Depends(get_db)):
    return _to_league_out(_get_league_or_404(db, league_id))


@router.post("/{league_id}/join", response_model=schemas.LeagueOut)
def join_league(
    league_id: int,
    join_in: schemas.JoinLeagueRequest = schemas.JoinLeagueRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    league = _get_league_or_404(db, league_id)

    existing = (
        db.query(models.LeagueMembership)
        .filter(
            models.LeagueMembership.league_id == league_id,
            models.LeagueMembership.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        return _to_league_out(league)

    if league.join_code and league.join_code != (join_in.code or "").strip().upper():
        raise HTTPException(status_code=403, detail="קוד הזמנה שגוי")

    membership = models.LeagueMembership(league_id=league_id, user_id=current_user.id)
    db.add(membership)
    db.commit()

    db.refresh(league)
    return _to_league_out(league)


@router.get("/{league_id}/invite-code", response_model=schemas.InviteCodeOut)
def get_invite_code(
    league_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    league = _get_league_or_404(db, league_id)
    is_member = any(m.user_id == current_user.id for m in league.memberships)
    if not is_member:
        raise HTTPException(status_code=403, detail="רק חברי הליגה יכולים לראות את קוד ההזמנה")

    if not league.join_code:
        league.join_code = _generate_join_code(db)
        db.commit()
        db.refresh(league)

    return schemas.InviteCodeOut(code=league.join_code)


@router.get("/{league_id}/members", response_model=list[schemas.MemberOut])
def list_members(league_id: int, db: Session = Depends(get_db)):
    league = _get_league_or_404(db, league_id)
    return [m.user for m in league.memberships]


@router.get("/{league_id}/standings", response_model=list[schemas.StandingRow])
def get_standings(league_id: int, db: Session = Depends(get_db)):
    league = _get_league_or_404(db, league_id)

    stats = {
        m.user.id: {"user": m.user, "played": 0, "wins": 0, "losses": 0, "points": 0}
        for m in league.memberships
    }

    matches = (
        db.query(models.Match)
        .filter(
            models.Match.league_id == league_id,
            models.Match.status == models.MatchStatus.completed,
        )
        .all()
    )

    for match in matches:
        p1, p2 = stats.get(match.player1_id), stats.get(match.player2_id)
        if not p1 or not p2:
            continue
        p1["played"] += 1
        p2["played"] += 1
        if match.player1_score > match.player2_score:
            p1["wins"] += 1
            p1["points"] += 3
            p2["losses"] += 1
        elif match.player2_score > match.player1_score:
            p2["wins"] += 1
            p2["points"] += 3
            p1["losses"] += 1

    rows = sorted(stats.values(), key=lambda r: (-r["points"], -r["wins"]))
    return rows
