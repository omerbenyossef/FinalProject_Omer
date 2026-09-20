from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from .auth import _delete_user_account
from .leagues import _week_end_saturday

router = APIRouter(prefix="/ops", tags=["ops"])

MIN_LEAGUE_PLAYERS = 2
NEVER_STARTED_DAYS = 14
STALLED_NOT_PLAYED_FRACTION = 0.5
VOIDED_FLAG_THRESHOLD = 2


def _range_start(range_key: str, now: datetime) -> datetime | None:
    if range_key == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if range_key == "all":
        return None
    # default: this week (Sunday-Saturday, matching the app's round-boundary convention)
    js_day = (now.weekday() + 1) % 7
    start = now - timedelta(days=js_day)
    return start.replace(hour=0, minute=0, second=0, microsecond=0)


def _round_window(league: models.League, matches: list[models.Match]):
    """Returns (round_number, matches_in_round) for the league's most recently
    generated round — i.e. where its schedule actually stands, not what
    calendar date math alone would say — or (None, []) if no round exists yet.
    A round that calendar math says should already be over does not mean
    much on its own (that's just what round we'd assign brand-new matches to
    right now); what matters for "stalled" is whether the round the league's
    matches actually sit in has run past its own due date unplayed."""
    if league.schedule_started_at is None or not matches:
        return None, []
    round_number = max(m.round_number or 0 for m in matches) or None
    if round_number is None:
        return None, []
    round_matches = [m for m in matches if m.round_number == round_number]
    return round_number, round_matches


@router.get("/overview", response_model=schemas.OpsOverviewOut)
def ops_overview(
    range: str = "week",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="רק מפעיל האפליקציה יכול לגשת למסך הזה")
    if range not in ("week", "month", "all"):
        raise HTTPException(status_code=400, detail="טווח לא תקין")

    now = datetime.utcnow()
    range_start = _range_start(range, now)

    leagues = db.query(models.League).all()
    all_matches = (
        db.query(models.Match).filter(models.Match.kind == models.MatchKind.league).all()
    )
    matches_by_league: dict[int, list[models.Match]] = {}
    for m in all_matches:
        matches_by_league.setdefault(m.league_id, []).append(m)

    memberships = db.query(models.LeagueMembership).all()
    members_by_league: dict[int, list[models.LeagueMembership]] = {}
    for mem in memberships:
        members_by_league.setdefault(mem.league_id, []).append(mem)

    leagues_count = sum(1 for lg in leagues if range_start is None or lg.created_at >= range_start)
    players_count = len(
        {
            mem.user_id
            for mem in memberships
            if range_start is None or mem.joined_at >= range_start
        }
    )
    matches_count = sum(
        1
        for m in all_matches
        if m.status == models.MatchStatus.completed
        and m.played_at is not None
        and (range_start is None or m.played_at >= range_start)
    )
    voided_count = sum(
        1
        for m in all_matches
        if m.status == models.MatchStatus.disputed
        and m.disputed_at is not None
        and (range_start is None or m.disputed_at >= range_start)
    )

    flagged: list[schemas.OpsFlaggedLeague] = []
    healthy: list[schemas.OpsHealthyLeague] = []

    for league in leagues:
        league_matches = matches_by_league.get(league.id, [])
        members = members_by_league.get(league.id, [])
        member_count = len(members)

        league_voided = [m for m in league_matches if m.status == models.MatchStatus.disputed]
        pair_counts: dict[frozenset, int] = {}
        for m in league_voided:
            key = frozenset((m.player1_id, m.player2_id))
            pair_counts[key] = pair_counts.get(key, 0) + 1
        same_pair_voided = any(count >= 2 for count in pair_counts.values())

        flag = None
        round_number, round_matches = _round_window(league, league_matches)

        if round_number is not None and round_matches:
            round_end = _week_end_saturday(league.schedule_started_at)
            if round_number > 1:
                round_end = round_end + timedelta(days=(league.round_length_days or 7) * (round_number - 1))
            played = sum(1 for m in round_matches if m.status == models.MatchStatus.completed)
            not_played_fraction = 1 - (played / len(round_matches))
            if now > round_end and not_played_fraction > STALLED_NOT_PLAYED_FRACTION:
                flag = "stalled"
        elif league.schedule_started_at is None:
            age_days = (now - league.created_at).days
            if age_days >= NEVER_STARTED_DAYS and member_count < MIN_LEAGUE_PLAYERS:
                flag = "never_started"

        if flag is None and len(league_voided) >= VOIDED_FLAG_THRESHOLD:
            flag = "voided"

        if flag:
            flagged.append(
                schemas.OpsFlaggedLeague(
                    league_id=league.id,
                    league_name=league.name,
                    flag=flag,
                    round_number=round_number,
                    round_length_days=league.round_length_days,
                    schedule_started_at=league.schedule_started_at,
                    created_at=league.created_at,
                    member_count=member_count,
                    capacity=league.capacity,
                    round_matches_total=len(round_matches),
                    round_matches_played=sum(
                        1 for m in round_matches if m.status == models.MatchStatus.completed
                    ),
                    league_matches_total=len(league_matches),
                    voided_count=len(league_voided),
                    same_pair_voided=same_pair_voided,
                )
            )
        else:
            healthy.append(
                schemas.OpsHealthyLeague(
                    league_id=league.id,
                    league_name=league.name,
                    round_number=round_number,
                    round_length_days=league.round_length_days,
                    schedule_started_at=league.schedule_started_at,
                    created_at=league.created_at,
                    member_count=member_count,
                    matches_total=len(round_matches),
                    matches_played=sum(
                        1 for m in round_matches if m.status == models.MatchStatus.completed
                    ),
                )
            )

    # Newest first: an operator cares most about what's freshly gone wrong (or
    # freshly started fine), not leagues that have been quietly fine for
    # months — and RUNNING FINE's list is cut down to a handful up front, so
    # this ordering is what decides which leagues are visible at all.
    flagged.sort(key=lambda f: f.created_at, reverse=True)
    healthy.sort(key=lambda h: h.created_at, reverse=True)

    return schemas.OpsOverviewOut(
        range=range,
        leagues_count=leagues_count,
        players_count=players_count,
        matches_count=matches_count,
        voided_count=voided_count,
        flagged=flagged,
        healthy=healthy,
    )


def _require_admin(user: models.User) -> None:
    """The only gate that counts. Hiding the way in on the client is a
    courtesy; this is what makes the screen the admin's alone."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="רק מנהל המערכת יכול לגשת למסך הזה")


@router.get("/directory", response_model=schemas.AdminDirectoryOut)
def admin_directory(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Every player and every league, for the admin's management screen.

    Counted with group-by queries rather than a loop per row: at a few
    hundred players a per-row count is hundreds of round trips, and this
    screen is meant to open instantly however big the app gets."""
    _require_admin(current_user)

    leagues_per_user = dict(
        db.query(models.LeagueMembership.user_id, func.count(models.LeagueMembership.id))
        .group_by(models.LeagueMembership.user_id)
        .all()
    )

    # A completed match counts for both of its players, so the two columns are
    # counted separately and added together.
    played_per_user: dict[int, int] = {}
    for column in (models.Match.player1_id, models.Match.player2_id):
        rows = (
            db.query(column, func.count(models.Match.id))
            .filter(models.Match.status == models.MatchStatus.completed)
            .group_by(column)
            .all()
        )
        for user_id, count in rows:
            if user_id is not None:
                played_per_user[user_id] = played_per_user.get(user_id, 0) + count

    levels_per_user: dict[int, list[schemas.AdminUserLevel]] = {}
    for rating, sport_name in (
        db.query(models.PlayerRating, models.Sport.name)
        .join(models.Sport, models.Sport.id == models.PlayerRating.sport_id)
        .all()
    ):
        levels_per_user.setdefault(rating.user_id, []).append(
            schemas.AdminUserLevel(
                sport_name=sport_name,
                level=rating.level,
                provisional=bool(rating.provisional),
            )
        )

    users = [
        schemas.AdminUserRow(
            id=u.id,
            name=u.name,
            email=u.email,
            photo_url=u.photo_url,
            created_at=u.created_at,
            is_admin=u.is_admin,
            intro_seen=u.intro_seen,
            leagues=leagues_per_user.get(u.id, 0),
            matches_played=played_per_user.get(u.id, 0),
            levels=sorted(levels_per_user.get(u.id, []), key=lambda l: l.sport_name),
        )
        for u in (
            db.query(models.User)
            .filter(models.User.deleted_at.is_(None))
            .order_by(models.User.id.desc())
            .all()
        )
    ]

    members_per_league = dict(
        db.query(models.LeagueMembership.league_id, func.count(models.LeagueMembership.id))
        .group_by(models.LeagueMembership.league_id)
        .all()
    )
    matches_per_league = dict(
        db.query(models.Match.league_id, func.count(models.Match.id))
        .filter(models.Match.league_id.isnot(None))
        .group_by(models.Match.league_id)
        .all()
    )
    played_per_league = dict(
        db.query(models.Match.league_id, func.count(models.Match.id))
        .filter(
            models.Match.league_id.isnot(None),
            models.Match.status == models.MatchStatus.completed,
        )
        .group_by(models.Match.league_id)
        .all()
    )
    creator_names = dict(db.query(models.User.id, models.User.name).all())

    leagues = [
        schemas.AdminLeagueRow(
            id=l.id,
            name=l.name,
            sport_name=l.sport.name if l.sport else "",
            is_open=bool(l.is_open),
            creator_name=creator_names.get(l.created_by, ""),
            member_count=members_per_league.get(l.id, 0),
            capacity=l.capacity,
            level_min=l.level_min,
            level_max=l.level_max,
            created_at=l.created_at,
            starts_at=l.starts_at,
            schedule_started_at=l.schedule_started_at,
            matches_total=matches_per_league.get(l.id, 0),
            matches_played=played_per_league.get(l.id, 0),
        )
        for l in (
            db.query(models.League)
            .options(joinedload(models.League.sport))
            .order_by(models.League.id.desc())
            .all()
        )
    ]

    return schemas.AdminDirectoryOut(users=users, leagues=leagues)


@router.delete("/users/{user_id}", response_model=schemas.MessageOut)
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Close a player's account from the admin screen.

    Runs the same cleanup as a player deleting their own account: the
    account is anonymised and deactivated rather than erased, because its id
    is a foreign key on matches, memberships and leagues, and the other
    players' standings and history have to survive it. Matches of theirs
    that were never played are dropped; results that were are kept, so
    nobody else's record changes underneath them.

    Irreversible — there is no undo path back to a live account."""
    _require_admin(current_user)
    if user_id == current_user.id:
        # Deleting the operator account from the operator screen is a trap,
        # not a feature. Their own profile has the usual way out.
        raise HTTPException(status_code=400, detail="אי אפשר למחוק את החשבון שלך מכאן")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="המשתמש לא נמצא")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="אי אפשר למחוק חשבון מנהל")

    name = user.name
    _delete_user_account(db, user)
    return schemas.MessageOut(message=f"החשבון של {name} נמחק")
