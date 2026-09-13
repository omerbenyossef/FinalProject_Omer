"""home-week-168a.md — everything the home screen shows, in one payload.

The screen is a diary of the current week: the matches of the active round,
friendly invitations still waiting for an answer, and the league standings
tiles. One request, because the screen has no second state to load into.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..rating_utils import get_rating, match_winner_id, round_to_half
from .leagues import _compute_my_standing, _current_round_number, _round_ends_at
from .matches import _auto_confirm_overdue
from .schedule import _not_played_void

router = APIRouter(prefix="/home", tags=["home"])

# A friendly with no round behind it counts as this week's business until its
# scheduled time is a week gone (the same threshold the rest of the app uses).
FRIENDLY_WINDOW = timedelta(days=7)


def _match_state(match: models.Match, user_id: int) -> str:
    """What the card has to offer on this match.

    scheduled          — time agreed, hasn't been played/reported yet
    played             — the time has passed, nobody reported
    no_time            — no time agreed
    waiting_on_them    — I reported, they haven't answered
    confirm_mine       — they reported, it's waiting on me
    not_played         — both sides agreed it never happened
    """
    if _not_played_void(match):
        return "not_played"
    if match.status == models.MatchStatus.pending_confirmation:
        if match.corrected_sets is not None:
            return "waiting_on_them" if match.corrected_by == user_id else "confirm_mine"
        return "waiting_on_them" if match.reported_by == user_id else "confirm_mine"
    if not match.scheduled_at or not match.schedule_confirmed:
        return "no_time"
    return "played" if match.scheduled_at <= datetime.utcnow() else "scheduled"


def _void_note(match: models.Match, user_id: int) -> str:
    """How a voided match got there — both sides said so, or one did and the
    other never answered."""
    if match.confirmed_by is not None:
        return "שניכם דיווחתם שהמשחק לא שוחק"
    if match.reported_by == user_id:
        return "דיווחת שהמשחק לא שוחק · אין תגובה מהיריב"
    return "היריב דיווח שהמשחק לא שוחק · לא הגבת"


def _next_round_starts_at(league: models.League) -> datetime | None:
    """When this league's next round opens — the day after the live round
    ends, or the league's own start date if it hasn't begun. None once the
    planned season is over."""
    if not league.schedule_started_at:
        return league.starts_at
    current_round = _current_round_number(league.schedule_started_at, league.round_length_days or 7)
    if current_round is None:
        return league.schedule_started_at
    if league.planned_rounds and current_round >= league.planned_rounds:
        return None
    ends_at = _round_ends_at(league, current_round)
    return ends_at + timedelta(days=1) if ends_at else None


def _players_near_level(db: Session, leagues, user_id: int, level: float | None) -> int:
    """How many players in my leagues are within half a level of me — the
    pool a friendly match would come from."""
    if level is None or not leagues:
        return 0
    member_ids = {
        m.user_id for league in leagues for m in league.memberships if m.user_id != user_id
    }
    if not member_ids:
        return 0
    sport_ids = {league.sport_id for league in leagues}
    ratings = (
        db.query(models.PlayerRating)
        .filter(
            models.PlayerRating.user_id.in_(member_ids),
            models.PlayerRating.sport_id.in_(sport_ids),
        )
        .all()
    )
    near = {r.user_id for r in ratings if abs(round_to_half(r.level) - level) <= 0.5}
    return len(near)


def _last_match(db: Session, user_id: int, sport_id: int | None) -> schemas.HomeWeekLastMatchOut | None:
    mine = or_(models.Match.player1_id == user_id, models.Match.player2_id == user_id)
    query = (
        db.query(models.Match)
        .options(
            joinedload(models.Match.player1),
            joinedload(models.Match.player2),
            joinedload(models.Match.league),
        )
        .filter(models.Match.status == models.MatchStatus.completed, mine)
    )
    matches = [m for m in query.all() if m.sets]
    if sport_id is not None:
        matches = [
            m for m in matches
            if (m.league.sport_id if m.league_id and m.league else m.sport_id) == sport_id
        ]
    if not matches:
        return None
    matches.sort(
        key=lambda m: (m.played_at or m.confirmed_at or m.scheduled_at or m.created_at or datetime.min),
        reverse=True,
    )
    match = matches[0]
    i_am_player1 = match.player1_id == user_id
    opponent = match.player2 if i_am_player1 else match.player1
    sets = match.sets or []
    if not i_am_player1:
        sets = [{"player1_games": s["player2_games"], "player2_games": s["player1_games"]} for s in sets]
    sample = (
        db.query(models.RatingSample)
        .filter(models.RatingSample.user_id == user_id, models.RatingSample.match_id == match.id)
        .order_by(models.RatingSample.id.desc())
        .first()
    )
    delta = None
    if sample:
        delta = round(sample.level_after - sample.level_before, 2)
        if delta == 0:
            delta = None
    return schemas.HomeWeekLastMatchOut(
        opponent_name=opponent.name if opponent else "",
        my_sets=sets,
        won=match_winner_id(match) == user_id,
        round=match.round_number,
        league_name=match.league.name if match.league_id and match.league else None,
        played_at=match.played_at or match.confirmed_at or match.scheduled_at,
        ntrp_delta=delta,
    )


@router.get("/week", response_model=schemas.HomeWeekOut)
def home_week(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    sport_id: int | None = None,
):
    _auto_confirm_overdue(db)
    now = datetime.utcnow()

    my_leagues = (
        db.query(models.League)
        .join(models.LeagueMembership)
        .options(joinedload(models.League.memberships))
        .filter(models.LeagueMembership.user_id == current_user.id)
        .all()
    )
    if sport_id is not None:
        my_leagues = [l for l in my_leagues if l.sport_id == sport_id]

    mine = or_(
        models.Match.player1_id == current_user.id,
        models.Match.player2_id == current_user.id,
    )

    matches: list[schemas.HomeWeekMatchOut] = []
    round_info: schemas.HomeWeekRoundOut | None = None

    for league in my_leagues:
        current_round = _current_round_number(league.schedule_started_at, league.round_length_days or 7)
        ends_at = _round_ends_at(league, current_round)
        if current_round and ends_at and (round_info is None or ends_at < round_info.ends_at):
            round_info = schemas.HomeWeekRoundOut(number=current_round, ends_at=ends_at)

        rows = (
            db.query(models.Match)
            .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
            .filter(
                models.Match.league_id == league.id,
                models.Match.status.in_(
                    [
                        models.MatchStatus.pending,
                        models.MatchStatus.pending_confirmation,
                        # A match both players agreed wasn't played is voided,
                        # but it stays on this week's page until its round is
                        # over — with the option to move it to a later one.
                        models.MatchStatus.disputed,
                    ]
                ),
                mine,
            )
            .all()
        )
        for match in rows:
            if match.status == models.MatchStatus.disputed and not _not_played_void(match):
                continue
            # Only the live round is "this week" — anything left over from a
            # closed round belongs to the open-matches screen.
            if current_round is not None and match.round_number not in (None, current_round):
                continue
            if match.round_number is not None and current_round is None:
                continue
            opponent = match.player2 if match.player1_id == current_user.id else match.player1
            matches.append(
                schemas.HomeWeekMatchOut(
                    id=match.id,
                    opponent_name=opponent.name if opponent else "",
                    league_name=league.name,
                    round=match.round_number,
                    scheduled_at=match.scheduled_at if match.schedule_confirmed else None,
                    state=_match_state(match, current_user.id),
                    note=_void_note(match, current_user.id) if _not_played_void(match) else None,
                )
            )

    friendlies = (
        db.query(models.Match)
        .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
        .filter(
            models.Match.kind == models.MatchKind.friendly,
            models.Match.status.in_(
                [models.MatchStatus.pending, models.MatchStatus.pending_confirmation]
            ),
            mine,
        )
        .all()
    )
    invites: list[schemas.HomeWeekInviteOut] = []
    for match in friendlies:
        if sport_id is not None and match.sport_id != sport_id:
            continue
        opponent = match.player2 if match.player1_id == current_user.id else match.player1
        if match.invite_status == models.FriendlyInviteStatus.pending:
            # An invitation I sent isn't mine to answer — it shows on the
            # matches screen under "waiting on them".
            if match.player1_id == current_user.id:
                continue
            rating = get_rating(db, match.player1_id, match.sport_id)
            invites.append(
                schemas.HomeWeekInviteOut(
                    id=match.id,
                    from_name=match.player1.name if match.player1 else "",
                    from_level=round_to_half(rating.level) if rating else None,
                    proposed_at=match.scheduled_at,
                    created_at=match.created_at,
                )
            )
            continue
        if match.invite_status != models.FriendlyInviteStatus.accepted:
            continue
        reference = match.scheduled_at or match.created_at
        if reference and now - reference > FRIENDLY_WINDOW:
            continue
        matches.append(
            schemas.HomeWeekMatchOut(
                id=match.id,
                opponent_name=opponent.name if opponent else "",
                league_name=None,
                round=None,
                scheduled_at=match.scheduled_at if match.schedule_confirmed else None,
                state=_match_state(match, current_user.id),
            )
        )

    # Scheduled first, earliest to latest; everything without a time after.
    matches.sort(key=lambda m: (m.scheduled_at is None, m.scheduled_at or datetime.max))

    leagues_out: list[schemas.HomeWeekLeagueOut] = []
    for league in my_leagues:
        completed = (
            db.query(models.Match)
            .filter(
                models.Match.league_id == league.id,
                models.Match.status == models.MatchStatus.completed,
            )
            .all()
        )
        standing = _compute_my_standing(league, current_user.id, completed)
        leagues_out.append(
            schemas.HomeWeekLeagueOut(
                id=league.id,
                name=league.name,
                position=standing[0] if standing else None,
                size=standing[1] if standing else len(league.memberships),
                round=_current_round_number(league.schedule_started_at, league.round_length_days or 7),
            )
        )
    # Leagues with a live round first — those are the two the tiles show.
    leagues_out.sort(key=lambda l: (l.round is None, l.position or 99))

    # 170a — what the screen says when there is nothing to play this week.
    next_starts = [d for d in (_next_round_starts_at(l) for l in my_leagues) if d is not None]
    next_round_starts_at = min(next_starts) if next_starts else None
    my_rating = get_rating(db, current_user.id, sport_id) if sport_id else None
    my_level = round_to_half(my_rating.level) if my_rating else None

    return schemas.HomeWeekOut(
        matches=matches,
        invites=invites,
        leagues=leagues_out,
        round=round_info,
        next_round_starts_at=next_round_starts_at,
        players_near_level=_players_near_level(db, my_leagues, current_user.id, my_level),
        my_level=my_level,
        last_match=_last_match(db, current_user.id, sport_id),
    )
