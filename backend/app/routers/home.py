"""home-week-168a.md — everything the home screen shows, in one payload.

The screen is a diary of the current week: the matches of the active round,
friendly invitations still waiting for an answer, and the league standings
tiles. One request, because the screen has no second state to load into.
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..match_sides import in_pair, mine as match_mine, my_side_is_first, opponent_label, opponents, teammate
from ..rating_utils import get_rating, match_winner_id, round_to_half
from .leagues import _compute_my_standing, _current_round_number, _round_ends_at
from .matches import _auto_confirm_overdue
from .schedule import _not_played_void

class _Nobody:
    """So "the partner, if there is one" stays one expression at each of the
    three places a week card is built."""

    name = None


_NOBODY = _Nobody()


router = APIRouter(prefix="/home", tags=["home"])

# A friendly with no round behind it counts as this week's business until its
# scheduled time is a week gone (the same threshold the rest of the app uses).
FRIENDLY_WINDOW = timedelta(days=7)


def _match_state(match: models.Match, user_id: int) -> str:
    """What the card has to offer on this match.

    scheduled          — time agreed, hasn't been played/reported yet
    played             — the time has passed, nobody reported
    no_time            — nobody has put a time forward at all
    time_from_them     — they proposed a time, mine to accept or turn down
    time_from_me       — I proposed a time, waiting on them
    waiting_on_them    — I reported, they haven't answered
    confirm_mine       — they reported, it's waiting on me
    not_played         — both sides agreed it never happened
    invite_sent        — I invited them and they haven't answered yet
    """
    if _not_played_void(match):
        return "not_played"
    if match.status == models.MatchStatus.pending_confirmation:
        if match.corrected_sets is not None:
            return "waiting_on_them" if match.corrected_by == user_id else "confirm_mine"
        return "waiting_on_them" if match.reported_by == user_id else "confirm_mine"
    # "No time agreed" used to cover a proposed-but-unconfirmed time as well
    # as no time at all, and the card for it says "propose a time". So after
    # someone accepted an invitation that already carried a time, both players
    # were told to propose one — as though hers had never existed. It had: it
    # was still on the match, just never confirmed, and this branch hid it.
    if not match.scheduled_at:
        return "no_time"
    if not match.schedule_confirmed:
        return "time_from_me" if match.scheduled_by == user_id else "time_from_them"
    return "played" if match.scheduled_at <= datetime.utcnow() else "scheduled"


def _match_place(match: models.Match) -> Optional[str]:
    """The venue if it is one the app knows, otherwise whatever was typed in."""
    if match.venue is not None:
        return match.venue.name
    return match.court or None


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
    if not near:
        return 0
    # "7 players near 3.5" has to mean seven people who could actually be
    # invited, so the demo league's inhabitants don't count towards it.
    real = {
        u.id
        for u in db.query(models.User.id, models.User.is_demo)
        .filter(models.User.id.in_(near), models.User.is_demo.isnot(True))
        .all()
    }
    return len(real)


def _last_match(
    db: Session, user_id: int, sport_id: int | None, pair_id: int | None = None
) -> schemas.HomeWeekLastMatchOut | None:
    mine = _lens(user_id, pair_id)
    query = (
        db.query(models.Match)
        .options(
            joinedload(models.Match.player1),
            joinedload(models.Match.player2),
            joinedload(models.Match.league),
            joinedload(models.Match.venue),
        )
        .filter(models.Match.status == models.MatchStatus.completed, mine)
    )
    # A row needs a name, an opponent and a readable score to be worth
    # showing; anything less renders as a card with nothing in it.
    matches = [
        m
        for m in query.all()
        if m.sets
        and all(isinstance(x, dict) and "player1_games" in x and "player2_games" in x for x in m.sets)
        and (m.player2 if m.player1_id == user_id else m.player1) is not None
    ]
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
    # Which half of the stored score is this viewer's. Not player1_id == me:
    # in doubles that is false for the second member of a pair, and their own
    # result would come back the wrong way round.
    i_am_player1 = my_side_is_first(db, match, user_id)
    opponent_name = opponent_label(db, match, user_id)
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
        opponent_name=opponent_name,
        my_sets=sets,
        won=match_winner_id(match) == user_id,
        round=match.round_number,
        league_name=match.league.name if match.league_id and match.league else None,
        played_at=match.played_at or match.confirmed_at or match.scheduled_at,
        ntrp_delta=delta,
    )


def _venue_out(match: models.Match) -> schemas.VenueOut | None:
    """The venue itself, for the card that draws its court. `place` still
    carries the line of text, which is all the smaller cards want."""
    if not match.venue:
        return None
    return schemas.VenueOut.model_validate(match.venue)


def _played_at(match: models.Match):
    return match.played_at or match.confirmed_at or match.scheduled_at or match.created_at or datetime.min


def _i_won(db: Session, match: models.Match, user_id: int) -> bool | None:
    """Did this viewer's side win. None when the match was a dead heat on both
    sets and games, which match_winner_id's own docstring says must never be
    read as a loss for either side."""
    winner_id = match_winner_id(match)
    if winner_id is None:
        return None
    return (winner_id == match.player1_id) == my_side_is_first(db, match, user_id)


def _last_meeting(
    db: Session, user_id: int, opponent_id: int | None, before: datetime
) -> schemas.HomeWeekLastMeetingOut | None:
    """203b — the last finished match between these two.

    The line it feeds ("you won last time") is the one thing that makes a
    fixture feel like a rivalry rather than an appointment, and it is worth a
    query of its own: the alternative is loading every result the viewer has
    and finding the opponent in it, which is most of their history to answer
    one sentence.

    Opponent-by-id, so it is only asked in singles: in doubles "last time"
    would have to mean the pair, and the pair's opponent is a label."""
    if not opponent_id:
        return None
    rows = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.completed,
            or_(
                and_(models.Match.player1_id == user_id, models.Match.player2_id == opponent_id),
                and_(models.Match.player1_id == opponent_id, models.Match.player2_id == user_id),
            ),
        )
        .all()
    )
    rows = [m for m in rows if m.sets and _played_at(m) < before]
    if not rows:
        return None
    rows.sort(key=_played_at, reverse=True)
    match = rows[0]
    i_am_player1 = my_side_is_first(db, match, user_id)
    mine, theirs = (
        (match.player1_score, match.player2_score)
        if i_am_player1
        else (match.player2_score, match.player1_score)
    )
    return schemas.HomeWeekLastMeetingOut(
        won=_i_won(db, match, user_id),
        played_at=_played_at(match),
        score=f"{mine}-{theirs}" if mine is not None and theirs is not None else None,
    )


def _win_streak(db: Session, user_id: int, sport_id: int | None, pair_id: int | None) -> int:
    """How many in a row, counting back from the most recent result.

    A drawn match (no winner at all) ends the count rather than being skipped:
    it is the last thing that happened, and a streak that reaches past it
    would be claiming something the player did not do."""
    rows = (
        db.query(models.Match)
        .filter(models.Match.status == models.MatchStatus.completed, _lens(user_id, pair_id))
        .all()
    )
    rows = [m for m in rows if m.sets]
    if sport_id is not None:
        rows = [
            m for m in rows
            if (m.league.sport_id if m.league_id and m.league else m.sport_id) == sport_id
        ]
    rows.sort(key=_played_at, reverse=True)
    streak = 0
    for match in rows:
        if _i_won(db, match, user_id) is not True:
            break
        streak += 1
    return streak


def _week_bounds(now: datetime) -> tuple[datetime, datetime]:
    """The calendar week the player is in. Sunday to Sunday, because that is
    the week here — a Saturday match belongs to the week that is ending, not
    to the one starting the next morning."""
    start = (now - timedelta(days=(now.weekday() + 1) % 7)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return start, start + timedelta(days=7)


def _matches_this_week(
    db: Session, user_id: int, sport_id: int | None, pair_id: int | None, now: datetime
) -> int:
    """Matches of mine with a time inside this calendar week — played or still
    to come. Counted off the agreed time rather than the result, because the
    greeting is about how busy the week is, and a match on Friday is part of
    the week on Tuesday."""
    start, end = _week_bounds(now)
    rows = (
        db.query(models.Match)
        .filter(
            models.Match.scheduled_at.isnot(None),
            models.Match.scheduled_at >= start,
            models.Match.scheduled_at < end,
            _lens(user_id, pair_id),
        )
        .all()
    )
    if sport_id is not None:
        rows = [
            m for m in rows
            if (m.league.sport_id if m.league_id and m.league else m.sport_id) == sport_id
        ]
    # An invitation nobody has accepted is not a match in anybody's week yet.
    return sum(
        1
        for m in rows
        # A match both sides agreed never happened did not happen, however it
        # sits in the table; an invitation nobody accepted is not in anybody's
        # week yet.
        if m.invite_status in (None, models.FriendlyInviteStatus.accepted)
        and not _not_played_void(m)
    )


def _lens(user_id: int, pair_id: int | None):
    """My matches, or — when a pair is chosen — that pair's alone."""
    pair_filter = in_pair(pair_id)
    return match_mine(user_id) if pair_filter is None else pair_filter


@router.get("/week", response_model=schemas.HomeWeekOut)
def home_week(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    sport_id: int | None = None,
    pair_id: int | None = None,
):
    """The week ahead. With pair_id, the week of that pair alone — the pair
    switcher is a lens, and this is the first surface it looks through."""
    _auto_confirm_overdue(db)
    now = datetime.utcnow()

    membership_filter = [models.LeagueMembership.user_id == current_user.id]
    if pair_id:
        membership_filter.append(models.LeagueMembership.pair_id == pair_id)
    my_leagues = (
        db.query(models.League)
        .join(models.LeagueMembership)
        .options(joinedload(models.League.memberships))
        .filter(*membership_filter)
        .all()
    )
    if sport_id is not None:
        my_leagues = [l for l in my_leagues if l.sport_id == sport_id]

    mine = _lens(current_user.id, pair_id)

    matches: list[schemas.HomeWeekMatchOut] = []
    round_info: schemas.HomeWeekRoundOut | None = None

    for league in my_leagues:
        current_round = _current_round_number(league.schedule_started_at, league.round_length_days or 7)
        ends_at = _round_ends_at(league, current_round)
        if current_round and ends_at and (round_info is None or ends_at < round_info.ends_at):
            round_info = schemas.HomeWeekRoundOut(number=current_round, ends_at=ends_at)

        rows = (
            db.query(models.Match)
            .options(
                joinedload(models.Match.player1),
                joinedload(models.Match.player2),
                joinedload(models.Match.venue),
            )
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
            facing = opponents(db, match, current_user.id)
            matches.append(
                schemas.HomeWeekMatchOut(
                    id=match.id,
                    opponent_name=opponent_label(db, match, current_user.id),
                    # One face in singles; in doubles the card would have to
                    # show two, so it shows none and leans on the names.
                    opponent_photo_url=facing[0].photo_url if len(facing) == 1 else None,
                    opponent_id=facing[0].id if len(facing) == 1 else None,
                    partner_name=(teammate(db, match, current_user.id) or _NOBODY).name,
                    league_name=league.name,
                    round=match.round_number,
                    scheduled_at=match.scheduled_at,
                    state=_match_state(match, current_user.id),
                    place=_match_place(match),
                    venue=_venue_out(match),
                    note=_void_note(match, current_user.id) if _not_played_void(match) else None,
                )
            )

    friendlies = (
        db.query(models.Match)
        .options(
            joinedload(models.Match.player1),
            joinedload(models.Match.player2),
            joinedload(models.Match.venue),
        )
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
    # Held back rather than added: see the note where they are spent, below.
    sent_invites: list[schemas.HomeWeekMatchOut] = []
    for match in friendlies:
        if sport_id is not None and match.sport_id != sport_id:
            continue
        facing = opponents(db, match, current_user.id)
        if match.invite_status == models.FriendlyInviteStatus.pending:
            # An invitation I sent isn't mine to answer, so it isn't an invite
            # row — but it is still something of mine happening this week, at a
            # time I proposed. Leaving it out entirely meant a player whose only
            # tennis was an invitation they'd sent had an empty diary and got
            # sent to the old home screen and left there.
            if match.player1_id == current_user.id:
                reference = match.scheduled_at or match.created_at
                if reference and now - reference > FRIENDLY_WINDOW:
                    continue
                sent_invites.append(
                    schemas.HomeWeekMatchOut(
                        id=match.id,
                        opponent_name=opponent_label(db, match, current_user.id),
                        opponent_photo_url=facing[0].photo_url if len(facing) == 1 else None,
                        opponent_id=facing[0].id if len(facing) == 1 else None,
                        partner_name=(teammate(db, match, current_user.id) or _NOBODY).name,
                        league_name=None,
                        round=None,
                        scheduled_at=match.scheduled_at,
                        state="invite_sent",
                        place=_match_place(match),
                        venue=_venue_out(match),
                    )
                )
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
                opponent_name=opponent_label(db, match, current_user.id),
                opponent_photo_url=facing[0].photo_url if len(facing) == 1 else None,
                opponent_id=facing[0].id if len(facing) == 1 else None,
                partner_name=(teammate(db, match, current_user.id) or _NOBODY).name,
                league_name=None,
                round=None,
                scheduled_at=match.scheduled_at,
                state=_match_state(match, current_user.id),
                place=_match_place(match),
                venue=_venue_out(match),
            )
        )

    # An invitation still waiting for an answer isn't this week's business —
    # it lives on the matches screen, where it can be re-timed or withdrawn.
    # The exception is the player who has nothing else at all: no league, no
    # match, no invitation of their own to answer. Without this their week is
    # empty, and an empty week with no league is what hands them to the old
    # first-day screen. So it shows for the player whose first move in the app
    # was to invite someone, and stops showing the moment they have anything
    # else — a league, a match, or an invitation waiting on them.
    if sent_invites and not my_leagues and not matches and not invites:
        matches.extend(sent_invites)

    # Scheduled first, earliest to latest; everything without a time after.
    matches.sort(key=lambda m: (m.scheduled_at is None, m.scheduled_at or datetime.max))

    # 203b asks "have we played before" of the next match only. Asked of every
    # card it would be a query per row for a line only the top card has room
    # to print.
    if matches:
        matches[0].last_meeting = _last_meeting(db, current_user.id, matches[0].opponent_id, now)

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
        last_match=_last_match(db, current_user.id, sport_id, pair_id),
        matches_this_week=_matches_this_week(db, current_user.id, sport_id, pair_id, now),
        win_streak=_win_streak(db, current_user.id, sport_id, pair_id),
    )


@router.get("/matches", response_model=list[schemas.HomeWeekMatchOut])
def my_matches(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    sport_id: int | None = None,
    pair_id: int | None = None,
):
    """205a — every match of mine that is not finished, league and friendly
    alike, in the shape the cards already read.

    Not /home/week with the filters taken off: that one answers "this week",
    and deliberately drops a match whose round has closed and a friendly a
    week past its time, because a diary of the week should not carry them.
    The Play screen is the opposite question — "everything I still have to
    deal with" — so nothing is dropped for being late. It is exactly the
    matches that fell out of the week's answer that somebody opening this
    screen is looking for.

    An invitation nobody has accepted is left out: it is not a match yet, it
    is a question, and it has its own screen."""
    _auto_confirm_overdue(db)
    mine = _lens(current_user.id, pair_id)

    rows = (
        db.query(models.Match)
        .options(
            joinedload(models.Match.player1),
            joinedload(models.Match.player2),
            joinedload(models.Match.league),
            joinedload(models.Match.venue),
        )
        .filter(
            models.Match.status.in_(
                [
                    models.MatchStatus.pending,
                    models.MatchStatus.pending_confirmation,
                    models.MatchStatus.disputed,
                ]
            ),
            mine,
        )
        .all()
    )

    out: list[schemas.HomeWeekMatchOut] = []
    for match in rows:
        if match.status == models.MatchStatus.disputed and not _not_played_void(match):
            continue
        if match.invite_status == models.FriendlyInviteStatus.pending:
            continue
        league = match.league
        match_sport = league.sport_id if league else match.sport_id
        if sport_id is not None and match_sport != sport_id:
            continue
        facing = opponents(db, match, current_user.id)
        out.append(
            schemas.HomeWeekMatchOut(
                id=match.id,
                opponent_name=opponent_label(db, match, current_user.id),
                opponent_photo_url=facing[0].photo_url if len(facing) == 1 else None,
                opponent_id=facing[0].id if len(facing) == 1 else None,
                partner_name=(teammate(db, match, current_user.id) or _NOBODY).name,
                league_name=league.name if league else None,
                round=match.round_number,
                scheduled_at=match.scheduled_at,
                state=_match_state(match, current_user.id),
                place=_match_place(match),
                venue=_venue_out(match),
                note=_void_note(match, current_user.id) if _not_played_void(match) else None,
                round_ends_at=_round_ends_at(league, match.round_number) if league else None,
            )
        )

    # Soonest first; the ones with no time at all last, where the screen's
    # own "not scheduled" group puts them anyway.
    out.sort(key=lambda m: (m.scheduled_at is None, m.scheduled_at or datetime.max))
    return out
