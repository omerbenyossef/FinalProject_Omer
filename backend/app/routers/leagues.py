import random
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user
from .matches import _auto_confirm_overdue

router = APIRouter(prefix="/leagues", tags=["leagues"])


def _week_end_saturday(dt: datetime) -> datetime:
    # Matches the frontend's formatWeekLabel week-boundary convention
    # (JS Date.getDay(): Sunday=0 ... Saturday=6).
    js_day = (dt.weekday() + 1) % 7
    days_until_saturday = (6 - js_day + 7) % 7
    return dt + timedelta(days=days_until_saturday)


def _current_round_number(schedule_started_at, round_length_days: int = 7, now: datetime | None = None):
    if schedule_started_at is None:
        return None
    now = now or datetime.utcnow()
    round1_end = _week_end_saturday(schedule_started_at)
    if now.date() <= round1_end.date():
        return 1
    offset_days = (now.date() - round1_end.date()).days
    return 2 + (offset_days - 1) // round_length_days


VALID_BEST_OF = (1, 3, 5)
VALID_ROUND_LENGTH_DAYS = (7, 14)


def _validate_rules(best_of: int | None, round_length_days: int | None) -> None:
    if best_of is not None and best_of not in VALID_BEST_OF:
        raise HTTPException(status_code=400, detail="מספר הסטים למשחק חייב להיות 1, 3 או 5")
    if round_length_days is not None and round_length_days not in VALID_ROUND_LENGTH_DAYS:
        raise HTTPException(status_code=400, detail="תדירות לוח המשחקים חייבת להיות שבועית או דו-שבועית")


def _generate_join_code(db: Session) -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        exists = db.query(models.League).filter(models.League.join_code == code).first()
        if not exists:
            return code


def _compute_my_standing(league: models.League, user_id: int, matches: list[models.Match]):
    stats = {m.user_id: {"wins": 0, "losses": 0, "points": 0} for m in league.memberships}
    for match in matches:
        p1, p2 = stats.get(match.player1_id), stats.get(match.player2_id)
        if not p1 or not p2:
            continue
        if match.player1_score > match.player2_score:
            p1["wins"] += 1
            p1["points"] += 3
            p2["losses"] += 1
        elif match.player2_score > match.player1_score:
            p2["wins"] += 1
            p2["points"] += 3
            p1["losses"] += 1

    ordered = sorted(stats.items(), key=lambda kv: (-kv[1]["points"], -kv[1]["wins"]))
    rank = next((i + 1 for i, (uid, _) in enumerate(ordered) if uid == user_id), None)
    if rank is None:
        return None

    my = stats[user_id]
    played = my["wins"] + my["losses"]
    win_rate = round(my["wins"] / played * 100) if played else None
    return rank, len(ordered), my["wins"], my["losses"], win_rate


def _compute_my_next_match(db: Session, league: models.League, user_id: int):
    my_match_filter = or_(models.Match.player1_id == user_id, models.Match.player2_id == user_id)
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
        return None
    opponent = match.player2 if match.player1_id == user_id else match.player1
    return schemas.MyNextMatchSummary(opponent_name=opponent.name, round_number=match.round_number)


def _to_league_out(
    league: models.League,
    db: Session | None = None,
    current_user_id: int | None = None,
) -> schemas.LeagueOut:
    out = schemas.LeagueOut.model_validate(league)
    out.member_count = len(league.memberships)
    out.is_open = league.join_code is None
    out.best_of = league.best_of or 3
    out.round_length_days = league.round_length_days or 7

    if db is not None and current_user_id is not None:
        matches = (
            db.query(models.Match)
            .filter(
                models.Match.league_id == league.id,
                models.Match.status == models.MatchStatus.completed,
            )
            .all()
        )
        standing = _compute_my_standing(league, current_user_id, matches)
        if standing:
            out.my_rank, out.my_members_total, out.my_wins, out.my_losses, out.my_win_rate = standing

            current_round = _current_round_number(league.schedule_started_at, league.round_length_days or 7)
            if current_round and current_round > 1:
                prior_matches = [m for m in matches if (m.round_number or 0) < current_round]
                prior_standing = _compute_my_standing(league, current_user_id, prior_matches)
                if prior_standing:
                    out.my_rank_trend = prior_standing[0] - out.my_rank

        out.my_next_match = _compute_my_next_match(db, league, current_user_id)

    return out


@router.get("/", response_model=list[schemas.LeagueOut])
def list_leagues(db: Session = Depends(get_db)):
    _auto_confirm_overdue(db)
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
    _auto_confirm_overdue(db)
    leagues = (
        db.query(models.League)
        .join(models.LeagueMembership)
        .options(joinedload(models.League.sport), joinedload(models.League.memberships))
        .filter(models.LeagueMembership.user_id == current_user.id)
        .order_by(models.League.created_at.desc())
        .all()
    )
    return [_to_league_out(l, db, current_user.id) for l in leagues]


@router.get("/mine/next-matches", response_model=list[schemas.NextMatchEntry])
def my_next_matches(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
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
                    best_of=league.best_of or 3,
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

    _validate_rules(league_in.best_of, league_in.round_length_days)

    league = models.League(
        name=league_in.name,
        description=league_in.description,
        sport_id=league_in.sport_id,
        created_by=current_user.id,
        join_code=None if league_in.is_open else _generate_join_code(db),
        best_of=league_in.best_of or 3,
        round_length_days=league_in.round_length_days or 7,
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


@router.patch("/{league_id}/rules", response_model=schemas.LeagueOut)
def update_league_rules(
    league_id: int,
    rules_in: schemas.LeagueRulesUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    league = _get_league_or_404(db, league_id)
    if league.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="רק יוצר הליגה יכול לשנות את חוקי הליגה")

    _validate_rules(rules_in.best_of, rules_in.round_length_days)

    if rules_in.best_of is not None:
        league.best_of = rules_in.best_of
    if rules_in.round_length_days is not None:
        league.round_length_days = rules_in.round_length_days

    db.commit()
    db.refresh(league)
    return _to_league_out(league, db, current_user.id)


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
    _auto_confirm_overdue(db)
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
