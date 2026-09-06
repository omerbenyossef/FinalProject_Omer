import math
import random
import string
from datetime import datetime, timedelta
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user
from ..rating_utils import get_rating, match_winner_id, round_to_half
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


# "Best of 1" was dropped as a choice — courts here are booked by the hour,
# so the format is picked by how long the slot is (an hour ≈ best of 3, two
# hours ≈ best of 5), and "best of 1" doesn't correspond to a real booking
# increment. Leagues created before this change may still have best_of=1;
# they keep working, this only blocks it going forward.
VALID_BEST_OF = (3, 5)
VALID_ROUND_LENGTH_DAYS = (7, 14)


def _validate_rules(best_of: int | None, round_length_days: int | None) -> None:
    if best_of is not None and best_of not in VALID_BEST_OF:
        raise HTTPException(status_code=400, detail="פורמט המשחק חייב להיות שעה (עד 3 סטים) או שעתיים (עד 5 סטים)")
    if round_length_days is not None and round_length_days not in VALID_ROUND_LENGTH_DAYS:
        raise HTTPException(status_code=400, detail="תדירות לוח המשחקים חייבת להיות שבועית או דו-שבועית")


def _validate_capacity(capacity: int | None, current_member_count: int | None = None) -> None:
    if capacity is None:
        return
    if capacity < 2:
        raise HTTPException(status_code=400, detail="בליגה צריכים להיות לפחות 2 מקומות")
    if current_member_count is not None and capacity < current_member_count:
        raise HTTPException(status_code=400, detail="אי אפשר לקבוע קיבולת נמוכה ממספר החברים הנוכחי")


def _validate_planned_rounds(planned_rounds: int | None) -> None:
    if planned_rounds is not None and planned_rounds < 1:
        raise HTTPException(status_code=400, detail="מספר המחזורים המתוכנן חייב להיות לפחות 1")


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _validate_level_range(level_min: float | None, level_max: float | None) -> None:
    for value in (level_min, level_max):
        if value is None:
            continue
        if value < models.RATING_MIN or value > models.RATING_MAX or (value * 2) % 1 != 0:
            raise HTTPException(status_code=400, detail="טווח הדירוג חייב להיות בין 1.5 ל-7.0 בקפיצות של חצי")
    if level_min is not None and level_max is not None and level_min > level_max:
        raise HTTPException(status_code=400, detail="הרמה המינימלית לא יכולה להיות גבוהה מהמקסימלית")


def _generate_join_code(db: Session) -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        exists = db.query(models.League).filter(models.League.join_code == code).first()
        if not exists:
            return code


def _compute_my_standing(league: models.League, user_id: int, matches: list[models.Match]):
    stats = {m.user_id: {"wins": 0, "losses": 0, "points": 0} for m in league.memberships}
    for match in matches:
        # A finished match stays part of both players' standing even after
        # one of them leaves the league — leaving only drops future
        # scheduling, not history that already happened.
        for uid in (match.player1_id, match.player2_id):
            stats.setdefault(uid, {"wins": 0, "losses": 0, "points": 0})
        p1, p2 = stats[match.player1_id], stats[match.player2_id]
        winner_id = match_winner_id(match)
        if winner_id is None:
            continue
        if winner_id == match.player1_id:
            p1["wins"] += 1
            p1["points"] += 3
            p2["losses"] += 1
        else:
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
    out.is_open = bool(league.is_open)
    out.best_of = league.best_of or 3
    out.round_length_days = league.round_length_days or 7
    out.level_min = league.level_min if league.level_min is not None else models.RATING_MIN
    out.level_max = league.level_max if league.level_max is not None else models.RATING_MAX

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
                models.Match.status == models.MatchStatus.pending_confirmation,
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
                    kind=models.MatchKind.league,
                    sport_id=league.sport_id,
                    league_id=league.id,
                    league_name=league.name,
                    schedule_started_at=league.schedule_started_at,
                    best_of=league.best_of or 3,
                    match=match,
                )
            )

    friendly_matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
        .filter(
            models.Match.kind == models.MatchKind.friendly,
            models.Match.invite_status != models.FriendlyInviteStatus.declined,
            models.Match.status != models.MatchStatus.completed,
            or_(
                models.Match.player1_id == current_user.id,
                models.Match.player2_id == current_user.id,
            ),
        )
        .order_by(models.Match.created_at.desc())
        .all()
    )
    for match in friendly_matches:
        entries.append(
            schemas.NextMatchEntry(
                kind=models.MatchKind.friendly,
                sport_id=match.sport_id,
                best_of=3,
                invite_status=match.invite_status,
                match=match,
            )
        )

    return entries


def _classify_open_item(match: models.Match, user_id: int) -> str | None:
    """Which of needsyou112a.md's four tile types (or None) a match is for
    this viewer. Mirrors matchUtils.js's matchScheduleState/getActionCandidates
    but fixes the bug those had: after a dispute, corrected_by (not
    reported_by) is the one actually waiting on a response."""
    if match.status == models.MatchStatus.pending_confirmation:
        if match.corrected_sets is not None:
            return "waiting" if match.corrected_by == user_id else "confirm"
        return None if match.reported_by == user_id else "confirm"

    if match.status == models.MatchStatus.pending:
        if not match.scheduled_at:
            return None
        if not match.schedule_confirmed:
            return "proposed" if match.scheduled_by != user_id else None
        return "report" if match.scheduled_at <= datetime.utcnow() else None

    return None


def _hypothetical_scores(match: models.Match) -> tuple[int, int]:
    sets = match.corrected_sets if match.corrected_sets is not None else match.sets
    if not sets:
        return match.player1_score or 0, match.player2_score or 0
    p1 = sum(1 for s in sets if s["player1_games"] > s["player2_games"])
    p2 = sum(1 for s in sets if s["player2_games"] > s["player1_games"])
    return p1, p2


def _rank_impact(db: Session, league: models.League, match: models.Match, user_id: int):
    """old_rank/new_rank/members_total for a pending_confirmation match — lets
    the "what needs you" screen show "CONFIRMING DROPS YOU #3 -> #4" without
    the viewer having to open the match to find out."""
    completed = (
        db.query(models.Match)
        .filter(models.Match.league_id == league.id, models.Match.status == models.MatchStatus.completed)
        .all()
    )
    old_standing = _compute_my_standing(league, user_id, completed)
    p1_score, p2_score = _hypothetical_scores(match)
    hypothetical = SimpleNamespace(
        player1_id=match.player1_id, player2_id=match.player2_id, player1_score=p1_score, player2_score=p2_score
    )
    new_standing = _compute_my_standing(league, user_id, [*completed, hypothetical])
    old_rank = old_standing[0] if old_standing else None
    new_rank = new_standing[0] if new_standing else None
    members_total = new_standing[1] if new_standing else (old_standing[1] if old_standing else None)
    return old_rank, new_rank, members_total


@router.get("/mine/open-items", response_model=schemas.OpenItemsOut)
def my_open_items(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Everything the viewer can act on right now, one server-sorted list —
    see needsyou112a.md. Feeds both the tab-bar action button (1 item ->
    jump straight to it, 2+ -> this list) and the NEEDS YOU screen itself."""
    _auto_confirm_overdue(db)
    my_leagues = (
        db.query(models.League)
        .join(models.LeagueMembership)
        .options(joinedload(models.League.memberships))
        .filter(models.LeagueMembership.user_id == current_user.id)
        .all()
    )

    items = []
    for league in my_leagues:
        my_match_filter = or_(
            models.Match.player1_id == current_user.id,
            models.Match.player2_id == current_user.id,
        )
        matches = (
            db.query(models.Match)
            .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
            .filter(
                models.Match.league_id == league.id,
                models.Match.status.in_([models.MatchStatus.pending, models.MatchStatus.pending_confirmation]),
                my_match_filter,
            )
            .all()
        )
        for match in matches:
            item_type = _classify_open_item(match, current_user.id)
            if not item_type:
                continue
            old_rank = new_rank = members_total = None
            if item_type == "confirm":
                old_rank, new_rank, members_total = _rank_impact(db, league, match, current_user.id)
            items.append(
                schemas.OpenItemOut(
                    type=item_type,
                    kind=models.MatchKind.league,
                    sport_id=league.sport_id,
                    league_id=league.id,
                    league_name=league.name,
                    schedule_started_at=league.schedule_started_at,
                    round_length_days=league.round_length_days or 7,
                    best_of=league.best_of or 3,
                    old_rank=old_rank,
                    new_rank=new_rank,
                    members_total=members_total,
                    match=match,
                )
            )

    friendly_matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
        .filter(
            models.Match.kind == models.MatchKind.friendly,
            models.Match.status.in_([models.MatchStatus.pending, models.MatchStatus.pending_confirmation]),
            or_(
                models.Match.player1_id == current_user.id,
                models.Match.player2_id == current_user.id,
            ),
        )
        .all()
    )
    for match in friendly_matches:
        item_type = _classify_open_item(match, current_user.id)
        if not item_type:
            continue
        items.append(
            schemas.OpenItemOut(
                type=item_type,
                kind=models.MatchKind.friendly,
                sport_id=match.sport_id,
                best_of=3,
                match=match,
            )
        )

    type_priority = {"confirm": 0, "report": 1, "proposed": 2, "waiting": 3}

    def sort_key(item: schemas.OpenItemOut):
        m = item.match
        if item.type in ("confirm", "waiting"):
            urgency = m.auto_confirm_at or datetime.max
        elif item.type == "proposed":
            urgency = m.scheduled_at or datetime.max
        else:
            urgency = m.scheduled_at or datetime.max
        return type_priority[item.type], urgency

    items.sort(key=sort_key)

    my_match_filter = or_(
        models.Match.player1_id == current_user.id,
        models.Match.player2_id == current_user.id,
    )
    scheduled_count = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.pending,
            models.Match.schedule_confirmed.is_(True),
            models.Match.scheduled_at > datetime.utcnow(),
            my_match_filter,
        )
        .count()
    )

    return schemas.OpenItemsOut(items=items, scheduled_count=scheduled_count)


@router.get("/open", response_model=list[schemas.OpenLeagueOut])
def list_open_leagues(
    sport_id: int,
    lat: float | None = None,
    lng: float | None = None,
    ntrp_min: float | None = None,
    ntrp_max: float | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Public leagues for a sport, ranked for "which one should I join" —
    see joinpublicleague110.md section 1. fit/distance/spots-remaining sort,
    full leagues always last, at most one BEST_FIT (needs a real rating —
    never fabricated for an unrated viewer)."""
    _auto_confirm_overdue(db)
    member_league_ids = {
        m.league_id
        for m in db.query(models.LeagueMembership).filter(models.LeagueMembership.user_id == current_user.id).all()
    }
    leagues = (
        db.query(models.League)
        .options(joinedload(models.League.sport), joinedload(models.League.memberships))
        .filter(
            models.League.sport_id == sport_id,
            models.League.is_open.is_(True),
            models.League.id.notin_(member_league_ids) if member_league_ids else True,
        )
        .all()
    )

    my_rating = get_rating(db, current_user.id, sport_id)
    my_level = round_to_half(my_rating.level) if my_rating else None

    rows = []
    for league in leagues:
        level_min = league.level_min if league.level_min is not None else models.RATING_MIN
        level_max = league.level_max if league.level_max is not None else models.RATING_MAX
        if ntrp_min is not None and level_max < ntrp_min:
            continue
        if ntrp_max is not None and level_min > ntrp_max:
            continue

        joined = len(league.memberships)
        is_full = league.capacity is not None and joined >= league.capacity
        distance_km = (
            round(_haversine_km(lat, lng, league.lat, league.lng), 1)
            if lat is not None and lng is not None and league.lat is not None and league.lng is not None
            else None
        )
        level_fit = abs(my_level - (level_min + level_max) / 2) if my_level is not None else None
        spots_remaining = (league.capacity - joined) if league.capacity is not None else 10_000

        rows.append(
            {
                "league": league,
                "level_min": level_min,
                "level_max": level_max,
                "joined": joined,
                "is_full": is_full,
                "distance_km": distance_km,
                "level_fit": level_fit,
                "spots_remaining": spots_remaining,
            }
        )

    def sort_key(row):
        return (
            row["is_full"],
            row["level_fit"] if row["level_fit"] is not None else 999,
            row["distance_km"] if row["distance_km"] is not None else 999_999,
            -row["spots_remaining"],
        )

    rows.sort(key=sort_key)

    best_fit_id = None
    if my_level is not None:
        eligible = [r for r in rows if not r["is_full"]]
        if eligible:
            best_fit_id = eligible[0]["league"].id

    return [
        schemas.OpenLeagueOut(
            id=row["league"].id,
            name=row["league"].name,
            location_name=row["league"].location_name,
            distance_km=row["distance_km"],
            rounds=row["league"].planned_rounds,
            round_length_days=row["league"].round_length_days or 7,
            level_min=row["level_min"],
            level_max=row["level_max"],
            joined=row["joined"],
            capacity=row["league"].capacity,
            starts_at=row["league"].starts_at,
            is_full=row["is_full"],
            best_fit=row["league"].id == best_fit_id,
        )
        for row in rows
    ]


@router.get("/resolve-code/{code}", response_model=schemas.LeagueCodeLookupOut)
def resolve_join_code(
    code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Looks a join code up without joining, so the frontend can route to
    the league's own page (and its rating-questionnaire gate) instead of
    calling /join-by-code blind and hitting the rating requirement as a
    dead-end error."""
    league = db.query(models.League).filter(models.League.join_code == code.strip().upper()).first()
    if not league:
        raise HTTPException(status_code=404, detail="קוד הזמנה לא נמצא")
    return schemas.LeagueCodeLookupOut(id=league.id)


@router.post("/join-by-code", response_model=schemas.LeagueOut)
def join_league_by_code(
    payload: schemas.JoinByCodeRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    code = (payload.code or "").strip().upper()
    league = db.query(models.League).filter(models.League.join_code == code).first()
    if not league:
        raise HTTPException(status_code=404, detail="קוד הזמנה לא נמצא")
    return _join_league_core(db, league, current_user, code)


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

    if not get_rating(db, current_user.id, league_in.sport_id):
        raise HTTPException(status_code=400, detail="צריך למלא שאלון דירוג לענף הזה לפני יצירת ליגה")

    _validate_rules(league_in.best_of, league_in.round_length_days)
    _validate_level_range(league_in.level_min, league_in.level_max)
    _validate_capacity(league_in.capacity)
    _validate_planned_rounds(league_in.planned_rounds)

    league = models.League(
        name=league_in.name,
        description=league_in.description,
        sport_id=league_in.sport_id,
        created_by=current_user.id,
        join_code=None if league_in.is_open else _generate_join_code(db),
        is_open=league_in.is_open,
        best_of=league_in.best_of or 3,
        round_length_days=league_in.round_length_days or 7,
        level_min=league_in.level_min if league_in.level_min is not None else models.RATING_MIN,
        level_max=league_in.level_max if league_in.level_max is not None else models.RATING_MAX,
        capacity=league_in.capacity,
        starts_at=league_in.starts_at,
        location_name=league_in.location_name,
        lat=league_in.lat,
        lng=league_in.lng,
        planned_rounds=league_in.planned_rounds,
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
    _validate_level_range(rules_in.level_min, rules_in.level_max)
    if not rules_in.clear_capacity:
        _validate_capacity(rules_in.capacity, len(league.memberships))
    if not rules_in.clear_planned_rounds:
        _validate_planned_rounds(rules_in.planned_rounds)

    if rules_in.best_of is not None:
        league.best_of = rules_in.best_of
    if rules_in.round_length_days is not None:
        league.round_length_days = rules_in.round_length_days
    if rules_in.level_min is not None:
        league.level_min = rules_in.level_min
    if rules_in.level_max is not None:
        league.level_max = rules_in.level_max
    if rules_in.clear_capacity:
        league.capacity = None
    elif rules_in.capacity is not None:
        league.capacity = rules_in.capacity
    if rules_in.clear_starts_at:
        league.starts_at = None
    elif rules_in.starts_at is not None:
        league.starts_at = rules_in.starts_at
    if rules_in.location_name is not None:
        league.location_name = rules_in.location_name
    if rules_in.lat is not None:
        league.lat = rules_in.lat
    if rules_in.lng is not None:
        league.lng = rules_in.lng
    if rules_in.clear_planned_rounds:
        league.planned_rounds = None
    elif rules_in.planned_rounds is not None:
        league.planned_rounds = rules_in.planned_rounds

    db.commit()
    db.refresh(league)
    return _to_league_out(league, db, current_user.id)


@router.get("/{league_id}", response_model=schemas.LeagueOut)
def get_league(league_id: int, db: Session = Depends(get_db)):
    return _to_league_out(_get_league_or_404(db, league_id))


@router.get("/{league_id}/preview", response_model=schemas.LeaguePreviewOut)
def preview_league(
    league_id: int,
    lat: float | None = None,
    lng: float | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The "before you join" gate — see joinpublicleague110.md section 2.
    level_histogram buckets every current member's rating across the
    league's own level range so the viewer can see "will I sink or swim"
    (their own bucket highlighted client-side via my_bucket_index)."""
    league = _get_league_or_404(db, league_id)
    level_min = league.level_min if league.level_min is not None else models.RATING_MIN
    level_max = league.level_max if league.level_max is not None else models.RATING_MAX
    joined = len(league.memberships)
    is_member = any(m.user_id == current_user.id for m in league.memberships)

    distance_km = (
        round(_haversine_km(lat, lng, league.lat, league.lng), 1)
        if lat is not None and lng is not None and league.lat is not None and league.lng is not None
        else None
    )

    ratings_by_user = {
        r.user_id: round_to_half(r.level)
        for r in db.query(models.PlayerRating).filter(
            models.PlayerRating.sport_id == league.sport_id,
            models.PlayerRating.user_id.in_([m.user_id for m in league.memberships]),
        )
    }

    bucket_count = 5
    span = max(level_max - level_min, 0.5)

    def bucket_for(level: float) -> int:
        idx = int((level - level_min) / span * bucket_count)
        return max(0, min(bucket_count - 1, idx))

    histogram = [0] * bucket_count
    for m in league.memberships:
        level = ratings_by_user.get(m.user_id)
        if level is not None:
            histogram[bucket_for(level)] += 1

    my_rating = get_rating(db, current_user.id, league.sport_id)
    my_level = round_to_half(my_rating.level) if my_rating else None
    my_bucket_index = bucket_for(my_level) if my_level is not None else None

    return schemas.LeaguePreviewOut(
        id=league.id,
        name=league.name,
        sport_id=league.sport_id,
        sport_name=league.sport.name,
        location_name=league.location_name,
        distance_km=distance_km,
        starts_at=league.starts_at,
        rounds=league.planned_rounds,
        round_length_days=league.round_length_days or 7,
        best_of=league.best_of or 3,
        joined=joined,
        capacity=league.capacity,
        level_min=level_min,
        level_max=level_max,
        level_histogram=histogram,
        my_level=my_level,
        my_bucket_index=my_bucket_index,
        is_member=is_member,
    )


def _join_league_core(
    db: Session, league: models.League, current_user: models.User, code: str | None = None
) -> schemas.LeagueOut:
    existing = (
        db.query(models.LeagueMembership)
        .filter(
            models.LeagueMembership.league_id == league.id,
            models.LeagueMembership.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        return _to_league_out(league)

    if league.join_code and league.join_code != (code or "").strip().upper():
        raise HTTPException(status_code=403, detail="קוד הזמנה שגוי")

    # Lock the league row for the capacity check + insert so two joins
    # racing for the last open spot can't both pass the check before either
    # commits (a no-op on SQLite, which serializes writes anyway; it matters
    # on Postgres). Count fresh from the membership table rather than
    # league.memberships, which may be a stale cached collection.
    db.query(models.League).filter(models.League.id == league.id).with_for_update().first()
    member_count = (
        db.query(models.LeagueMembership).filter(models.LeagueMembership.league_id == league.id).count()
    )
    if league.capacity is not None and member_count >= league.capacity:
        raise HTTPException(status_code=403, detail="הליגה מלאה")

    rating = get_rating(db, current_user.id, league.sport_id)
    if not rating:
        raise HTTPException(status_code=400, detail="צריך למלא שאלון דירוג לענף הזה לפני ההצטרפות")
    level_min = league.level_min if league.level_min is not None else models.RATING_MIN
    level_max = league.level_max if league.level_max is not None else models.RATING_MAX
    if not (level_min <= round_to_half(rating.level) <= level_max):
        raise HTTPException(status_code=403, detail="הדירוג שלך מחוץ לטווח הרמות של הליגה הזו")

    membership = models.LeagueMembership(league_id=league.id, user_id=current_user.id)
    db.add(membership)
    db.commit()

    db.refresh(league)

    if league.created_by != current_user.id:
        notify_user(
            db,
            league.created_by,
            "חבר חדש הצטרף לליגה",
            f"{current_user.name} הצטרף/ה לליגה {league.name}",
            f"/leagues/{league.id}",
        )

    return _to_league_out(league)


@router.post("/{league_id}/join", response_model=schemas.LeagueOut)
def join_league(
    league_id: int,
    join_in: schemas.JoinLeagueRequest = schemas.JoinLeagueRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    league = _get_league_or_404(db, league_id)
    return _join_league_core(db, league, current_user, join_in.code)


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
    league = _get_league_or_404(db, league_id)
    if league.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="רק יוצר הליגה יכול למחוק אותה")

    match_ids = [
        m.id for m in db.query(models.Match.id).filter(models.Match.league_id == league_id).all()
    ]
    if match_ids:
        # A completed, rated match has a RatingSample row pointing at it
        # (match_id FK) — deleting the match first would violate that
        # constraint on Postgres (SQLite doesn't enforce FKs by default,
        # which is why this only ever showed up in production).
        db.query(models.RatingSample).filter(models.RatingSample.match_id.in_(match_ids)).delete(
            synchronize_session=False
        )
    db.query(models.Match).filter(models.Match.league_id == league_id).delete()
    db.query(models.LeagueMembership).filter(models.LeagueMembership.league_id == league_id).delete()
    db.delete(league)
    db.commit()


@router.get("/{league_id}/members", response_model=list[schemas.MemberOut])
def list_members(league_id: int, db: Session = Depends(get_db)):
    league = _get_league_or_404(db, league_id)
    return [m.user for m in league.memberships]


def _empty_stats(league):
    return {
        m.user.id: {"user": m.user, "played": 0, "wins": 0, "losses": 0, "points": 0}
        for m in league.memberships
    }


def _accumulate_stats(stats, matches):
    for match in matches:
        # A finished match stays part of both players' standing even after
        # one of them leaves the league — leaving only drops future
        # scheduling, not history that already happened.
        for uid, user in ((match.player1_id, match.player1), (match.player2_id, match.player2)):
            if uid not in stats:
                stats[uid] = {"user": user, "played": 0, "wins": 0, "losses": 0, "points": 0}
        p1, p2 = stats[match.player1_id], stats[match.player2_id]
        p1["played"] += 1
        p2["played"] += 1
        winner_id = match_winner_id(match)
        if winner_id is None:
            continue
        if winner_id == match.player1_id:
            p1["wins"] += 1
            p1["points"] += 3
            p2["losses"] += 1
        else:
            p2["wins"] += 1
            p2["points"] += 3
            p1["losses"] += 1


@router.get("/{league_id}/standings", response_model=list[schemas.StandingRow])
def get_standings(league_id: int, db: Session = Depends(get_db)):
    _auto_confirm_overdue(db)
    league = _get_league_or_404(db, league_id)

    all_matches = db.query(models.Match).filter(models.Match.league_id == league_id).all()
    existing_rounds = sorted({m.round_number for m in all_matches if m.round_number})
    latest_round = existing_rounds[-1] if existing_rounds else None
    completed_matches = [m for m in all_matches if m.status == models.MatchStatus.completed]

    stats = _empty_stats(league)
    _accumulate_stats(stats, completed_matches)
    rows = sorted(stats.values(), key=lambda r: (-r["points"], -r["wins"]))

    rank_delta_by_user = {}
    if latest_round is not None and latest_round >= 2:
        prev_matches = [
            m for m in completed_matches if m.round_number is None or m.round_number < latest_round
        ]
        prev_stats = _empty_stats(league)
        _accumulate_stats(prev_stats, prev_matches)
        prev_rows = sorted(prev_stats.values(), key=lambda r: (-r["points"], -r["wins"]))
        prev_rank_by_user = {row["user"].id: idx + 1 for idx, row in enumerate(prev_rows)}
        current_rank_by_user = {row["user"].id: idx + 1 for idx, row in enumerate(rows)}
        for user_id, prev_rank in prev_rank_by_user.items():
            rank_delta_by_user[user_id] = prev_rank - current_rank_by_user[user_id]

    ratings_by_user = {
        r.user_id: r
        for r in db.query(models.PlayerRating)
        .filter(
            models.PlayerRating.sport_id == league.sport_id,
            models.PlayerRating.user_id.in_([m.user_id for m in league.memberships]),
        )
        .all()
    }

    for row in rows:
        row["rank_delta"] = rank_delta_by_user.get(row["user"].id)
        rating = ratings_by_user.get(row["user"].id)
        if rating:
            row["level"] = round_to_half(rating.level)
            row["provisional"] = rating.provisional

    return rows
