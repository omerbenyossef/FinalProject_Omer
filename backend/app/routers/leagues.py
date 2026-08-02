import random
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user

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
    out.is_open = league.join_code is None
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


@router.get("/mine", response_model=list[schemas.LeagueOut])
def list_my_leagues(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    leagues = (
        db.query(models.League)
        .join(models.LeagueMembership)
        .options(joinedload(models.League.sport), joinedload(models.League.memberships))
        .filter(models.LeagueMembership.user_id == current_user.id)
        .order_by(models.League.created_at.desc())
        .all()
    )
    return [_to_league_out(l) for l in leagues]


@router.get("/mine/next-matches", response_model=list[schemas.NextMatchEntry])
def my_next_matches(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    my_leagues = (
        db.query(models.League)
        .join(models.LeagueMembership)
        .filter(models.LeagueMembership.user_id == current_user.id)
        .all()
    )

    entries = []
    for league in my_leagues:
        my_match_filter = or_(
            models.Match.player1_id == current_user.id,
            models.Match.player2_id == current_user.id,
        )
        match = (
            db.query(models.Match)
            .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
            .filter(
                models.Match.league_id == league.id,
                models.Match.status == models.MatchStatus.pending,
                my_match_filter,
            )
            .order_by(models.Match.created_at.asc())
            .first()
        )
        if not match:
            match = (
                db.query(models.Match)
                .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
                .filter(
                    models.Match.league_id == league.id,
                    models.Match.status == models.MatchStatus.completed,
                    my_match_filter,
                )
                .order_by(models.Match.round_number.desc(), models.Match.played_at.desc())
                .first()
            )
        if match:
            entries.append(
                schemas.NextMatchEntry(
                    league_id=league.id,
                    league_name=league.name,
                    schedule_started_at=league.schedule_started_at,
                    match=match,
                )
            )

    return entries


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

    if league.created_by != current_user.id:
        notify_user(
            db,
            league.created_by,
            "חבר חדש הצטרף לליגה",
            f"{current_user.name} הצטרף/ה לליגה {league.name}",
            f"/leagues/{league_id}",
        )

    return _to_league_out(league)


@router.post("/{league_id}/leave", status_code=204)
def leave_league(
    league_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    league = _get_league_or_404(db, league_id)

    if league.created_by == current_user.id:
        raise HTTPException(
            status_code=400, detail="יוצר הליגה לא יכול לעזוב אותה, אפשר למחוק את הליגה"
        )

    membership = (
        db.query(models.LeagueMembership)
        .filter(
            models.LeagueMembership.league_id == league_id,
            models.LeagueMembership.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=400, detail="אינך חבר בליגה הזו")

    db.query(models.Match).filter(
        models.Match.league_id == league_id,
        models.Match.status == models.MatchStatus.pending,
        or_(
            models.Match.player1_id == current_user.id,
            models.Match.player2_id == current_user.id,
        ),
    ).delete()

    db.delete(membership)
    db.commit()


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


@router.delete("/{league_id}", status_code=204)
def delete_league(
    league_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="רק מנהל יכול למחוק ליגה")

    league = _get_league_or_404(db, league_id)
    db.query(models.Match).filter(models.Match.league_id == league_id).delete()
    db.query(models.LeagueMembership).filter(models.LeagueMembership.league_id == league_id).delete()
    db.delete(league)
    db.commit()


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
