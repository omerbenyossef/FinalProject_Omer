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
from ..rating_utils import get_rating, round_to_half
from .leagues import _compute_my_standing, _current_round_number, _round_ends_at
from .matches import _auto_confirm_overdue

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
    """
    if match.status == models.MatchStatus.pending_confirmation:
        if match.corrected_sets is not None:
            return "waiting_on_them" if match.corrected_by == user_id else "confirm_mine"
        return "waiting_on_them" if match.reported_by == user_id else "confirm_mine"
    if not match.scheduled_at or not match.schedule_confirmed:
        return "no_time"
    return "played" if match.scheduled_at <= datetime.utcnow() else "scheduled"


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
                    [models.MatchStatus.pending, models.MatchStatus.pending_confirmation]
                ),
                mine,
            )
            .all()
        )
        for match in rows:
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

    return schemas.HomeWeekOut(
        matches=matches,
        invites=invites,
        leagues=leagues_out,
        round=round_info,
    )
