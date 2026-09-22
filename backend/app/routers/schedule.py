from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user, resolve_match_notifications
from ..rating_utils import match_winner_id, round_to_half, update_ratings_for_match
from .friendly import MAX_SETS as FRIENDLY_MAX_SETS
from .leagues import _accumulate_stats, _empty_stats
from .leagues import _current_round_number, _round_ends_at
from .chat import unread_count
from .matches import CONFIRMATION_WINDOW, _auto_confirm_overdue, _to_naive_utc

router = APIRouter(prefix="/matches", tags=["schedule"])


def _get_match_for_participant(db: Session, match_id: int, user_id: int) -> models.Match:
    match = (
        db.query(models.Match)
        .options(
            joinedload(models.Match.player1),
            joinedload(models.Match.player2),
            joinedload(models.Match.league),
        )
        .filter(models.Match.id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if user_id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="Not a participant in this match")
    return match


def _schedule_status(match: models.Match, user_id: int) -> str:
    if match.scheduled_at is None:
        return "no_time"
    if match.schedule_confirmed:
        return "set"
    return "sent" if match.scheduled_by == user_id else "asked_you"


def _result_status(match: models.Match, user_id: int) -> Optional[str]:
    if match.status == models.MatchStatus.disputed:
        return "disputed"
    if match.status == models.MatchStatus.completed:
        return "final" if match.reported_by is not None else None
    if match.status == models.MatchStatus.pending_confirmation:
        if match.corrected_sets is not None:
            # Round 2: the original reporter is the one who accepts/rejects the
            # correction; the corrector is just waiting on them.
            return "pending_you" if user_id == match.reported_by else "pending_him"
        return "pending_you" if user_id != match.reported_by else "pending_him"
    return None


def _compute_prediction(
    db: Session, match: models.Match, current_user_id: int, sets_to_evaluate, h2h_wins: int, h2h_losses: int
) -> Optional[schemas.ResultPrediction]:
    """The 'IF YOU CONFIRM' forecast — only meaningful inside a league (a
    friendly match has no place/points), and only when there's an actual
    score on the table to evaluate. See resultconfirmdispute108.md section 4:
    if this can't be computed, the section is dropped, never shown as zero."""
    if not match.league_id or not sets_to_evaluate:
        return None
    league = match.league
    completed = [
        m for m in db.query(models.Match).filter(models.Match.league_id == match.league_id).all()
        if m.status == models.MatchStatus.completed
    ]
    stats_before = _empty_stats(league)
    _accumulate_stats(stats_before, completed)
    my_before = stats_before.get(current_user_id)
    if not my_before:
        return None
    rows_before = sorted(stats_before.values(), key=lambda r: (-r["points"], -r["wins"]))
    rank_before = next((i + 1 for i, r in enumerate(rows_before) if r["user"].id == current_user_id), None)

    fake_match = models.Match(
        player1_id=match.player1_id,
        player2_id=match.player2_id,
        player1_score=sum(1 for s in sets_to_evaluate if s["player1_games"] > s["player2_games"]),
        player2_score=sum(1 for s in sets_to_evaluate if s["player2_games"] > s["player1_games"]),
        sets=sets_to_evaluate,
    )
    stats_after = _empty_stats(league)
    _accumulate_stats(stats_after, completed + [fake_match])
    my_after = stats_after.get(current_user_id)
    rows_after = sorted(stats_after.values(), key=lambda r: (-r["points"], -r["wins"]))
    rank_after = next((i + 1 for i, r in enumerate(rows_after) if r["user"].id == current_user_id), None)

    i_won = match_winner_id(fake_match) == current_user_id

    return schemas.ResultPrediction(
        my_wins_before=my_before["wins"],
        my_losses_before=my_before["losses"],
        my_wins_after=my_after["wins"],
        my_losses_after=my_after["losses"],
        my_rank_before=rank_before,
        my_rank_after=rank_after,
        my_points_before=my_before["points"],
        my_points_after=my_after["points"],
        h2h_wins_before=h2h_wins,
        h2h_losses_before=h2h_losses,
        h2h_wins_after=h2h_wins + (1 if i_won else 0),
        h2h_losses_after=h2h_losses + (0 if i_won else 1),
    )


def _can_edit_report(match: models.Match) -> bool:
    """A report can be changed while the opponent hasn't answered and the round
    is still open. Once the round closes — or the match ended in a standoff —
    it is frozen."""
    if match.status != models.MatchStatus.pending_confirmation:
        return False
    if not match.league_id or not match.league or not match.round_number:
        return True
    ends_at = _round_ends_at(match.league, match.round_number)
    return ends_at is None or ends_at >= datetime.utcnow()


def _default_court(db: Session, match: models.Match) -> str | None:
    """The league's most recently used court, so 107a's COURT field can
    prefill to whatever the league has been playing on."""
    if not match.league_id:
        return None
    recent = (
        db.query(models.Match)
        .filter(
            models.Match.league_id == match.league_id,
            models.Match.court.isnot(None),
            models.Match.id != match.id,
        )
        .order_by(models.Match.id.desc())
        .first()
    )
    return recent.court if recent else None


@router.get("/friendly-draft", response_model=schemas.FriendlyDraftOut)
def get_friendly_draft(
    opponent_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The propose screen, for a friendly nobody has created yet. Tapping
    "invite" used to create the match then and there and notify the opponent,
    so the invitation went out before its sender had picked a time — and it
    went out with no time in it. Now nothing exists until a time is chosen,
    and this is what fills the screen in the meantime."""
    if opponent_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot invite yourself")
    opponent = db.query(models.User).filter(models.User.id == opponent_id).first()
    if not opponent:
        raise HTTPException(status_code=404, detail="Player not found")
    return schemas.FriendlyDraftOut(
        opponent=opponent,
        busy_windows=_busy_windows_for(db, current_user.id, opponent_id, 0),
        conflict_gap_minutes=int(CONFLICT_GAP_WINDOW.total_seconds() // 60),
    )


@router.get("/{match_id}", response_model=schemas.MatchDetailOut)
def get_match_detail(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    match = _get_match_for_participant(db, match_id, current_user.id)
    opponent = match.player2 if match.player1_id == current_user.id else match.player1

    sport_id = match.league.sport_id if match.league_id else match.sport_id
    my_ntrp = opp_ntrp = None
    if sport_id:
        ratings = {
            r.user_id: round_to_half(r.level)
            for r in db.query(models.PlayerRating).filter(
                models.PlayerRating.sport_id == sport_id,
                models.PlayerRating.user_id.in_([current_user.id, opponent.id]),
            )
        }
        my_ntrp = ratings.get(current_user.id)
        opp_ntrp = ratings.get(opponent.id)

    h2h_matches = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.completed,
            or_(
                and_(models.Match.player1_id == current_user.id, models.Match.player2_id == opponent.id),
                and_(models.Match.player1_id == opponent.id, models.Match.player2_id == current_user.id),
            ),
        )
        .order_by(models.Match.played_at.desc())
        .all()
    )
    h2h_wins = h2h_losses = 0
    last_match_sets = None
    for i, m in enumerate(h2h_matches):
        i_am_player1 = m.player1_id == current_user.id
        winner_id = match_winner_id(m)
        if winner_id == current_user.id:
            h2h_wins += 1
        elif winner_id is not None:
            h2h_losses += 1
        if i == 0:
            sets = m.sets
            if sets and not i_am_player1:
                sets = [{"player1_games": s["player2_games"], "player2_games": s["player1_games"]} for s in sets]
            last_match_sets = sets

    sets_to_evaluate = match.corrected_sets if match.corrected_sets is not None else match.sets
    prediction = None
    if match.status == models.MatchStatus.pending_confirmation:
        prediction = _compute_prediction(db, match, current_user.id, sets_to_evaluate, h2h_wins, h2h_losses)

    # reported_sets/corrected_sets are stored in the match's own player1/player2
    # orientation; the confirm screen always shows the viewer's column first
    # (resultconfirmdispute108.md section 3), so flip them when the viewer is
    # player2 — same convention as last_match_sets above.
    i_am_player1 = match.player1_id == current_user.id

    def _mine_first(sets):
        if not sets or i_am_player1:
            return sets
        return [{"player1_games": s["player2_games"], "player2_games": s["player1_games"]} for s in sets]

    return schemas.MatchDetailOut(
        id=match.id,
        kind=match.kind,
        opponent=opponent,
        league_id=match.league_id,
        league_name=match.league.name if match.league_id else None,
        round_number=match.round_number,
        schedule_started_at=match.league.schedule_started_at if match.league_id else None,
        round_length_days=match.league.round_length_days if match.league_id else None,
        status=_schedule_status(match, current_user.id),
        invite_status=match.invite_status.value if match.invite_status else None,
        invited_by=match.player1_id if match.kind == models.MatchKind.friendly else None,
        scheduled_at=match.scheduled_at,
        scheduled_by=match.scheduled_by,
        schedule_proposed_at=match.schedule_proposed_at,
        court=match.court,
        default_court=_default_court(db, match),
        duration_minutes=_match_duration_minutes(match),
        max_sets=(match.league.best_of or FRIENDLY_MAX_SETS) if match.league_id else FRIENDLY_MAX_SETS,
        i_am_player1=i_am_player1,
        my_ntrp=my_ntrp,
        opponent_ntrp=opp_ntrp,
        h2h_wins=h2h_wins,
        h2h_losses=h2h_losses,
        last_match_sets=last_match_sets,
        result_status=_result_status(match, current_user.id),
        reported_by=match.reported_by,
        confirmed_by=match.confirmed_by,
        reported_sets=_mine_first(match.sets),
        corrected_by=match.corrected_by,
        corrected_sets=_mine_first(match.corrected_sets),
        dispute_note=match.dispute_note,
        disputed_at=match.disputed_at,
        void_reason=match.void_reason,
        auto_confirm_at=match.auto_confirm_at,
        reported_at=match.played_at,
        reminder_sent_at=match.manual_reminded_at,
        can_edit=_can_edit_report(match),
        prediction=prediction,
        time_options=match.time_options,
        busy_windows=_busy_windows(db, match, current_user.id),
        conflict_gap_minutes=int(CONFLICT_GAP_WINDOW.total_seconds() // 60),
        unread_messages=unread_count(db, match.id, current_user.id),
        **_cost_state(match, current_user.id),
    )


CONFLICT_GAP_WINDOW = timedelta(hours=1)


def _match_duration_minutes(match: models.Match) -> int:
    """League matches derive their duration from the league's format (best of
    5 is a two-hour slot, everything else is one hour); a friendly match has
    no fixed format, so whatever the players agreed on at propose time is
    stored directly on the match."""
    if match.league_id:
        best_of = match.league.best_of if match.league else 3
        return 120 if best_of == 5 else 60
    return match.duration_minutes or 60


def _match_window(match: models.Match) -> tuple[datetime, datetime]:
    start = _to_naive_utc(match.scheduled_at)
    return start, start + timedelta(minutes=_match_duration_minutes(match))


def _busy_windows(db: Session, match: models.Match, viewer_id: int) -> list[schemas.BusyWindowOut]:
    """Every future slot either player is already committed to. The conflict
    engine checks the same thing at propose time, but only as a rejection —
    handing the windows to the client lets the grid grey those slots out
    before anyone taps them."""
    opponent_id = match.player2_id if viewer_id == match.player1_id else match.player1_id
    return _busy_windows_for(db, viewer_id, opponent_id, match.id)


def _busy_windows_for(
    db: Session, viewer_id: int, opponent_id: int, exclude_match_id: int
) -> list[schemas.BusyWindowOut]:
    """The same thing keyed off two player ids rather than a match, so the
    propose screen can grey slots out for a friendly that hasn't been created
    yet."""
    now = datetime.utcnow()
    by_window: dict[tuple[datetime, datetime], set[str]] = {}
    for user_id, whose in ((viewer_id, "me"), (opponent_id, "opponent")):
        for other in _other_confirmed_matches(db, user_id, exclude_match_id):
            start, end = _match_window(other)
            if end <= now:
                continue
            by_window.setdefault((start, end), set()).add(whose)
    return [
        schemas.BusyWindowOut(
            start=start,
            end=end,
            whose="both" if len(whose) == 2 else next(iter(whose)),
        )
        for (start, end), whose in sorted(by_window.items())
    ]


def _other_confirmed_matches(db: Session, user_id: int, exclude_match_id: int) -> list[models.Match]:
    """Every other CONFIRMED, not-yet-played match this player is in, across
    every sport and league. Pending (unconfirmed) proposals never count here
    — a player can hold several competing offers for overlapping slots until
    one of them actually gets confirmed."""
    return (
        db.query(models.Match)
        .options(joinedload(models.Match.league))
        .filter(
            models.Match.id != exclude_match_id,
            models.Match.status == models.MatchStatus.pending,
            models.Match.schedule_confirmed.is_(True),
            models.Match.scheduled_at.isnot(None),
            or_(models.Match.player1_id == user_id, models.Match.player2_id == user_id),
        )
        .all()
    )


def _both_players_confirmed_matches(db: Session, match: models.Match) -> list[models.Match]:
    others: dict[int, models.Match] = {}
    for user_id in {match.player1_id, match.player2_id}:
        for other in _other_confirmed_matches(db, user_id, match.id):
            others[other.id] = other
    return list(others.values())


def _overlaps_confirmed_match(db: Session, match: models.Match, start: datetime, end: datetime) -> bool:
    for other in _both_players_confirmed_matches(db, match):
        other_start, other_end = _match_window(other)
        if start < other_end and other_start < end:
            return True
    return False


def _enforce_schedule_conflicts(
    db: Session,
    match: models.Match,
    start: datetime,
    end: datetime,
    override_conflict_warning: bool,
) -> None:
    others = _both_players_confirmed_matches(db, match)

    for other in others:
        other_start, other_end = _match_window(other)
        if start < other_end and other_start < end:
            raise HTTPException(status_code=400, detail="כבר יש משחק מתואם בזמן הזה")

    if override_conflict_warning:
        return

    for other in others:
        other_start, other_end = _match_window(other)
        if other_end <= start:
            gap = start - other_end
        elif end <= other_start:
            gap = other_start - end
        else:
            continue
        if gap < CONFLICT_GAP_WINDOW:
            raise HTTPException(
                status_code=409,
                detail="יש לך משחק נוסף קרוב לשעה הזאת ביום הזה, לאשר בכל זאת?",
            )


def _auto_decline_conflicting_proposals(db: Session, match: models.Match, start: datetime, end: datetime) -> None:
    """Once one of several competing pending proposals for a slot gets
    confirmed, any other pending proposal either of these two players is
    still holding that now overlaps this window can't be kept alive — it
    falls away automatically, same field-clearing as a manual decline."""
    pending: dict[int, models.Match] = {}
    for user_id in (match.player1_id, match.player2_id):
        rows = (
            db.query(models.Match)
            .options(joinedload(models.Match.league))
            .filter(
                models.Match.id != match.id,
                models.Match.status == models.MatchStatus.pending,
                models.Match.schedule_confirmed.is_(False),
                models.Match.scheduled_at.isnot(None),
                or_(models.Match.player1_id == user_id, models.Match.player2_id == user_id),
            )
            .all()
        )
        for other in rows:
            pending[other.id] = other

    for other in pending.values():
        minutes = _match_duration_minutes(other)

        # A proposal offering several slots only loses the ones that actually
        # collide — the rest stay on the table, and the earliest survivor
        # takes over as the leading option.
        survivors = [
            option
            for option in other.time_options
            if not (start < _to_naive_utc(option.start_at) + timedelta(minutes=minutes)
                    and _to_naive_utc(option.start_at) < end)
        ]
        if other.time_options and survivors:
            for option in list(other.time_options):
                if option not in survivors:
                    db.delete(option)
            other.scheduled_at = min(_to_naive_utc(o.start_at) for o in survivors)
            db.add(other)
            continue

        other_start, other_end = _match_window(other)
        if not (start < other_end and other_start < end):
            continue
        for recipient_id in (other.player1_id, other.player2_id):
            notify_user(
                db,
                recipient_id,
                "הצעת הזמן בוטלה",
                "השעה שהוצעה למשחק שלכם כבר לא פנויה, ההצעה בוטלה אוטומטית",
                f"/matches/{other.id}/schedule",
                category="time_proposal",
                type="time_dropped",
                league_id=other.league_id,
                match_id=other.id,
                title_en="Time proposal cancelled",
                body_en="The time proposed for your match is no longer free, so the proposal was cancelled",
            )
        other.scheduled_at = None
        other.scheduled_by = None
        other.schedule_confirmed = False
        other.schedule_proposed_at = None
        other.court = None
        other.duration_minutes = None
        for option in list(other.time_options):
            db.delete(option)
        db.add(other)
    db.commit()


MAX_TIME_OPTIONS = 5


def _clear_time_options(db: Session, match: models.Match) -> None:
    """delete-orphan on the relationship turns this into DELETEs on flush."""
    match.time_options.clear()


@router.post("/{match_id}/schedule", response_model=schemas.MatchOut)
def propose_match_schedule(
    match_id: int,
    proposal: schemas.MatchScheduleProposal,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    # An invitation without a time is a question, not an invitation, so the
    # player who sent it may name the time in the same breath. The invited
    # player can't propose one back until they've accepted — there is nothing
    # for them to schedule yet.
    pending_invite = (
        match.kind == models.MatchKind.friendly
        and match.invite_status == models.FriendlyInviteStatus.pending
    )
    if pending_invite and current_user.id != match.player1_id:
        raise HTTPException(status_code=400, detail="ההזמנה עדיין לא אושרה")
    if (
        match.kind == models.MatchKind.friendly
        and match.invite_status not in (
            models.FriendlyInviteStatus.pending,
            models.FriendlyInviteStatus.accepted,
        )
    ):
        raise HTTPException(status_code=400, detail="ההזמנה עדיין לא אושרה")
    if match.status != models.MatchStatus.pending:
        raise HTTPException(status_code=400, detail="אי אפשר לתאם זמן למשחק שכבר דווח")

    raw = list(proposal.scheduled_at_options) or ([proposal.scheduled_at] if proposal.scheduled_at else [])
    starts = sorted({_to_naive_utc(value) for value in raw})
    if not starts:
        raise HTTPException(status_code=400, detail="יש לבחור זמן למשחק")
    if len(starts) > MAX_TIME_OPTIONS:
        raise HTTPException(status_code=400, detail="אפשר להציע עד חמישה זמנים")
    if starts[0] <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="זמן המשחק חייב להיות בעתיד")

    if match.league_id:
        duration_minutes = 120 if (match.league.best_of if match.league else 3) == 5 else 60
    else:
        duration_minutes = proposal.duration_minutes
        if not duration_minutes or duration_minutes <= 0:
            raise HTTPException(status_code=400, detail="יש לבחור משך זמן למשחק")

    if len(starts) == 1:
        # One slot is the old flow: the proposer answers the tight-gap warning
        # here and now, because there is nothing else for the opponent to pick.
        _enforce_schedule_conflicts(
            db,
            match,
            starts[0],
            starts[0] + timedelta(minutes=duration_minutes),
            proposal.override_conflict_warning,
        )
    else:
        # Several slots: only the hard check runs per option — a back-to-back
        # gap is a judgement call for whoever actually locks one of them in.
        for start in starts:
            if _overlaps_confirmed_match(db, match, start, start + timedelta(minutes=duration_minutes)):
                raise HTTPException(status_code=400, detail="אחד מהזמנים שבחרת כבר תפוס")

    _clear_time_options(db, match)
    for start in starts:
        db.add(
            models.MatchTimeOption(
                match_id=match.id,
                start_at=start,
                duration_minutes=duration_minutes,
                proposed_by=current_user.id,
            )
        )

    # The earliest option leads: scheduled_at drives every existing screen,
    # notification and sweep, and it is the time those screens display.
    match.scheduled_at = starts[0]
    match.scheduled_by = current_user.id
    match.schedule_confirmed = False
    match.schedule_proposed_at = datetime.utcnow()
    match.court = proposal.court
    # A venue off the list wins; its own name is what the screens show, so
    # the free-text court is cleared rather than left to contradict it.
    if proposal.venue_id is not None:
        venue = db.query(models.Venue).filter(models.Venue.id == proposal.venue_id).first()
        if not venue:
            raise HTTPException(status_code=404, detail="המגרש לא נמצא")
        match.venue_id = venue.id
        match.court = None
    else:
        match.venue_id = None
    match.duration_minutes = duration_minutes
    db.commit()
    db.refresh(match)

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    if pending_invite:
        # They were told about the invitation a moment ago; that row gives way
        # to this one rather than sitting above it saying half the story.
        db.query(models.Notification).filter(
            models.Notification.user_id == opponent_id,
            models.Notification.match_id == match.id,
        ).delete(synchronize_session=False)
        db.commit()
    title = "הזמנה למשחק ידידותי" if pending_invite else "הזמן למשחק שלכם"
    title_en = "Friendly invite" if pending_invite else "Your match time"
    if pending_invite:
        body = (
            f"{current_user.name} מזמין/ה אותך למשחק ידידותי והציע/ה שעה"
            if len(starts) == 1
            else f"{current_user.name} מזמין/ה אותך למשחק ידידותי והציע/ה {len(starts)} זמנים"
        )
        body_en = (
            f"{current_user.name} invited you to a friendly and suggested a time"
            if len(starts) == 1
            else f"{current_user.name} invited you to a friendly and suggested {len(starts)} times"
        )
    else:
        # The time was settled between them in the chat; this is the other
        # one writing it down, and all that is left is to say it is right.
        body = (
            f"{current_user.name} הזין/ה את הזמן שקבעתם — אשר/י שזה מה שסיכמתם"
            if len(starts) == 1
            else f"{current_user.name} הציע/ה {len(starts)} זמנים למשחק שלכם, בחר/י אחד מהם"
        )
        body_en = (
            f"{current_user.name} entered the time you agreed — confirm it"
            if len(starts) == 1
            else f"{current_user.name} proposed {len(starts)} times for your match — pick one"
        )
    notify_user(
        db,
        opponent_id,
        title,
        body,
        f"/matches/{match.id}",
        category="time_proposal",
        type="time_proposed",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en=title_en,
        body_en=body_en,
    )

    return match


@router.post("/{match_id}/schedule/confirm", response_model=schemas.MatchOut)
def confirm_match_schedule(
    match_id: int,
    payload: schemas.ScheduleConfirmRequest = schemas.ScheduleConfirmRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.scheduled_at is None:
        raise HTTPException(status_code=400, detail="אין הצעת זמן לאשר")
    if match.schedule_confirmed:
        raise HTTPException(status_code=400, detail="הזמן כבר מאושר")
    if match.scheduled_by == current_user.id:
        raise HTTPException(status_code=400, detail="לא ניתן לאשר הצעת זמן שהצעת בעצמך")

    # Saying yes to the time is saying yes to the invitation — one tap, not two.
    accepts_invite = (
        match.kind == models.MatchKind.friendly
        and match.invite_status == models.FriendlyInviteStatus.pending
        and current_user.id == match.player2_id
    )

    # Picking one of several offered slots. The one-tap confirms on the home,
    # round and league screens send no option_id — they only ever showed the
    # leading time, so rather than silently locking that one in, answer 409:
    # every one of those call sites already routes a 409 to the match screen,
    # where the player sees all of them and picks.
    if payload.option_id is None and len(match.time_options) > 1:
        raise HTTPException(status_code=409, detail="יש לבחור אחד מהזמנים שהוצעו")

    if payload.option_id is not None:
        chosen = next((o for o in match.time_options if o.id == payload.option_id), None)
        if chosen is None:
            raise HTTPException(status_code=400, detail="הזמן שבחרת כבר לא מוצע")
        match.scheduled_at = _to_naive_utc(chosen.start_at)
        if not match.league_id and chosen.duration_minutes:
            match.duration_minutes = chosen.duration_minutes

    if _to_naive_utc(match.scheduled_at) < datetime.utcnow():
        raise HTTPException(status_code=400, detail="הזמן שהוצע כבר עבר, צריך להציע שעה חדשה")

    start, end = _match_window(match)
    _enforce_schedule_conflicts(db, match, start, end, payload.override_conflict_warning)

    match.schedule_confirmed = True
    if accepts_invite:
        match.invite_status = models.FriendlyInviteStatus.accepted
    _clear_time_options(db, match)
    db.commit()
    db.refresh(match)

    _auto_decline_conflicting_proposals(db, match, start, end)

    proposer = match.player1 if match.scheduled_by == match.player1_id else match.player2
    notify_user(
        db,
        match.scheduled_by,
        "ההזמנה אושרה" if accepts_invite else "הזמן למשחק אושר",
        (
            f"{current_user.name} אישר/ה את ההזמנה ואת השעה שהצעת"
            if accepts_invite
            else f"{current_user.name} אישר/ה את הזמן שהצעת למשחק שלכם"
        ),
        f"/matches/{match.id}",
        category="time_proposal",
        type="time_confirmed",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en="Invite accepted" if accepts_invite else "Time confirmed",
        body_en=(
            f"{current_user.name} accepted your invite and the time you suggested"
            if accepts_invite
            else f"{current_user.name} confirmed the time you proposed"
        ),
    )
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"אישרת את הזמן למשחק מול {proposer.name if proposer else ''}",
        league_id=match.league_id,
        actor_name=current_user.name,
        body_en=f"You confirmed the time for your match against {proposer.name if proposer else ''}",
    )

    return match


@router.post("/{match_id}/schedule/decline", response_model=schemas.MatchOut)
def decline_match_schedule(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.scheduled_at is None:
        raise HTTPException(status_code=400, detail="אין הצעת זמן לבטל")
    if match.schedule_confirmed:
        raise HTTPException(status_code=400, detail="הזמן כבר מאושר")

    other_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    match.scheduled_at = None
    match.scheduled_by = None
    match.schedule_confirmed = False
    match.schedule_proposed_at = None
    match.court = None
    match.duration_minutes = None
    _clear_time_options(db, match)
    db.commit()
    db.refresh(match)

    notify_user(
        db,
        other_id,
        "הצעת הזמן בוטלה",
        f"{current_user.name} ביטל/ה את הצעת הזמן למשחק שלכם",
        f"/matches/{match.id}/schedule",
        category="time_proposal",
        type="time_declined",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en="Time proposal cancelled",
        body_en=f"{current_user.name} cancelled the time proposal for your match",
    )

    return match


@router.post("/{match_id}/cancel", response_model=schemas.MatchOut)
def cancel_match(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """180d — calling off a match whose time was already agreed. Either player,
    any time before a result is reported; once one is, the screen offers a
    dispute instead and this is gone.

    The two kinds part ways on what "cancelled" leaves behind. A league match
    still has to be played, so it keeps its place in the round and simply
    loses its time — back to "no time agreed". A friendly is the arrangement
    and nothing else, so cancelling ends it: it is marked declined, the same
    state a friendly that was never accepted sits in, which is what every list
    already reads as "this one is over". (A cancelled status of its own would
    be truer, but MatchStatus is a native enum on Postgres and adding a value
    to one of those in place is not a safe migration.)"""
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.status != models.MatchStatus.pending:
        raise HTTPException(status_code=400, detail="כבר יש תוצאה למשחק הזה — אפשר לערער עליה")

    was_at = match.scheduled_at
    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id

    match.scheduled_at = None
    match.scheduled_by = None
    match.schedule_confirmed = False
    match.schedule_proposed_at = None
    match.court = None
    match.duration_minutes = None
    match.time_options.clear()
    if match.kind == models.MatchKind.friendly:
        match.invite_status = models.FriendlyInviteStatus.declined
    db.commit()
    db.refresh(match)

    when = f"{was_at.day}.{was_at.month}" if was_at else None
    body = (
        f"{current_user.name} ביטל/ה את המשחק ב-{when}"
        if when
        else f"{current_user.name} ביטל/ה את המשחק שלכם"
    )
    body_en = (
        f"{current_user.name} cancelled the match on {when}"
        if when
        else f"{current_user.name} cancelled your match"
    )
    if match.kind == models.MatchKind.league:
        body += ". המשחק חוזר לרשימת המשחקים שצריך לקבוע להם זמן"
        body_en += ". It goes back to the matches that still need a time"
    notify_user(
        db,
        opponent_id,
        "המשחק בוטל",
        body,
        f"/matches/{match.id}" if match.kind == models.MatchKind.league else "/leagues",
        type="match_cancelled",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en="Match cancelled",
        body_en=body_en,
    )
    return match


def _my_share(match: models.Match) -> float | None:
    """A match is two people, so a share is half. Rounded to the agora, and
    the halves are allowed to differ by one when the total is odd — better
    than inventing a third of a shekel."""
    if match.court_cost is None:
        return None
    return round(match.court_cost / 2, 2)


def _cost_state(match: models.Match, viewer_id: int) -> dict:
    return dict(
        venue=match.venue,
        booked_by=match.booked_by,
        court_cost=match.court_cost,
        my_share=_my_share(match),
        cost_claimed_at=match.cost_claimed_at,
        cost_settled_at=match.cost_settled_at,
    )


@router.post("/{match_id}/cost", response_model=schemas.MatchDetailOut)
def set_match_cost(
    match_id: int,
    payload: schemas.MatchCostIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Whoever booked the court says what it cost. The app remembers the
    number and who is owed — it never moves the money, because the transfer
    is the easy part and every payment app in the country already does it."""
    match = _get_match_for_participant(db, match_id, current_user.id)
    amount = round(payload.amount, 2)
    changed = match.court_cost != amount or match.booked_by != current_user.id
    match.booked_by = current_user.id
    match.court_cost = amount
    if changed:
        # A new number is a new debt: whatever was claimed or settled against
        # the old one no longer means anything.
        match.cost_claimed_at = None
        match.cost_settled_at = None
    db.commit()
    db.refresh(match)

    if changed:
        other_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
        share = _my_share(match)
        notify_user(
            db,
            other_id,
            "הוזמן מגרש",
            f"{current_user.name} הזמין/ה את המגרש ב-{amount:g} ₪. חלקך: {share:g} ₪",
            f"/matches/{match.id}",
            type="court_cost",
            actor_name=current_user.name,
            league_id=match.league_id,
            match_id=match.id,
            title_en="Court booked",
            body_en=f"{current_user.name} booked the court for {amount:g}₪. Your share: {share:g}₪",
        )
    return get_match_detail(match.id, db, current_user)


@router.delete("/{match_id}/cost", response_model=schemas.MatchDetailOut)
def clear_match_cost(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.booked_by not in (None, current_user.id):
        raise HTTPException(status_code=403, detail="רק מי שרשם את העלות יכול להסיר אותה")
    match.booked_by = None
    match.court_cost = None
    match.cost_claimed_at = None
    match.cost_settled_at = None
    db.commit()
    return get_match_detail(match.id, db, current_user)


@router.post("/{match_id}/cost/claim", response_model=schemas.MatchDetailOut)
def claim_cost_paid(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The one who owes says they sent it."""
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.court_cost is None:
        raise HTTPException(status_code=400, detail="אין עלות רשומה למשחק הזה")
    if match.booked_by == current_user.id:
        raise HTTPException(status_code=400, detail="אתה מי שהזמין — אין לך מה להעביר")
    if match.cost_settled_at is not None:
        raise HTTPException(status_code=400, detail="ההתחשבנות כבר נסגרה")

    match.cost_claimed_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    share = _my_share(match)
    notify_user(
        db,
        match.booked_by,
        "העבירו לך",
        f"{current_user.name} סימן/ה שהעביר/ה לך {share:g} ₪ על המגרש",
        f"/matches/{match.id}",
        type="cost_claimed",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en="They marked it paid",
        body_en=f"{current_user.name} marked their {share:g}₪ share as sent",
    )
    return get_match_detail(match.id, db, current_user)


@router.post("/{match_id}/cost/settle", response_model=schemas.MatchDetailOut)
def settle_cost(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The booker confirms it arrived, and the two of them are square."""
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.court_cost is None:
        raise HTTPException(status_code=400, detail="אין עלות רשומה למשחק הזה")
    if match.booked_by != current_user.id:
        raise HTTPException(status_code=403, detail="רק מי שהזמין יכול לאשר שקיבל")
    if match.cost_settled_at is not None:
        return get_match_detail(match.id, db, current_user)

    match.cost_settled_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    other_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    notify_user(
        db,
        other_id,
        "ההתחשבנות נסגרה",
        f"{current_user.name} אישר/ה שקיבל/ה את חלקך על המגרש",
        f"/matches/{match.id}",
        type="cost_settled",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en="Settled up",
        body_en=f"{current_user.name} confirmed your share arrived",
    )
    return get_match_detail(match.id, db, current_user)


@router.post("/{match_id}/report-not-played", response_model=schemas.MatchOut)
def report_match_not_played(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Either player can flag that a scheduled match never actually
    happened, once its time has passed. This doesn't void the match by
    itself — it goes through the same pending_confirmation/reported_by
    machinery as a score report, so the other side has to agree before it
    counts as voided; one side can't unilaterally erase a match that was
    actually played."""
    _auto_confirm_overdue(db)
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.status != models.MatchStatus.pending:
        raise HTTPException(status_code=400, detail="כבר יש תוצאה למשחק הזה — אפשר רק לאשר אותה או לערער עליה")
    # Once the round is over the match is past regardless of what was agreed:
    # a time that came and went and a time that was never set are the same
    # "we didn't play it", and both have to be reportable — otherwise a match
    # nobody ever scheduled waits forever for a report it can't give.
    if not _round_is_over(match):
        if match.scheduled_at is None or not match.schedule_confirmed:
            raise HTTPException(
                status_code=400, detail="צריך לתאם ולאשר שעה למשחק לפני שאפשר לדווח שהוא לא בוצע"
            )
        if _to_naive_utc(match.scheduled_at) >= datetime.utcnow():
            raise HTTPException(status_code=400, detail="אפשר לדווח שמשחק לא בוצע רק אחרי השעה שנקבעה לו")

    match.status = models.MatchStatus.pending_confirmation
    match.reported_by = current_user.id
    match.sets = None
    match.player1_score = None
    match.player2_score = None
    match.void_reason = "not_played"
    match.confirmed_by = None
    match.confirmed_at = None
    match.auto_confirm_at = datetime.utcnow() + CONFIRMATION_WINDOW
    db.commit()
    db.refresh(match)

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    notify_user(
        db,
        opponent_id,
        "דיווח שהמשחק לא בוצע",
        f"{current_user.name} מדווח/ת שהמשחק שלכם לא התקיים, וממתין/ה לתשובה שלך",
        f"/matches/{match.id}/confirm",
        type="not_played_reported",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en="Reported as not played",
        body_en=f"{current_user.name} says your match never happened, and is waiting for your answer",
    )
    opponent = match.player2 if current_user.id == match.player1_id else match.player1
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"דיווחת שהמשחק מול {opponent.name if opponent else ''} לא התקיים. מחכה לאישור שלו/ה",
        league_id=match.league_id,
        actor_name=current_user.name,
        body_en=f"You reported that your match against {opponent.name if opponent else ''} never happened. Waiting for their answer",
    )

    return match


def _round_is_over(match: models.Match) -> bool:
    """A league match whose round has already closed. A friendly has no round,
    so it is never "over" in this sense."""
    if not match.league_id or not match.league:
        return False
    ends_at = _round_ends_at(match.league, match.round_number)
    return ends_at is not None and ends_at < datetime.utcnow()


def _not_played_void(match: models.Match) -> bool:
    """Both sides agreed the match never happened, so it is voided: it isn't
    counted anywhere, but the pairing itself is still owed."""
    return (
        match.status == models.MatchStatus.disputed
        and match.void_reason == "not_played"
        and match.corrected_sets is None
    )


# A make-up match belongs in one of the next rounds, not five months out, so
# the picker offers a short window.
MAX_RESCHEDULE_OPTIONS = 4


def _round_starts_at(league: models.League, round_number: int) -> datetime | None:
    if not league or not league.schedule_started_at:
        return None
    if round_number <= 1:
        return league.schedule_started_at
    previous_end = _round_ends_at(league, round_number - 1)
    return previous_end + timedelta(days=1) if previous_end else None


def _reschedule_options(db: Session, match: models.Match, user_id: int):
    """Which rounds a voided match can be moved into: the ones that haven't
    started yet. Rounds are just windows derived from the league's start date,
    so a round past the planned end of the season still has real dates — the
    last planned round is offered as the single fallback there, since a match
    that was never played has to go somewhere."""
    league = match.league
    current_round = _current_round_number(league.schedule_started_at, league.round_length_days or 7)
    first = (current_round or match.round_number or 0) + 1
    last = first + MAX_RESCHEDULE_OPTIONS - 1
    if league.planned_rounds:
        last = min(last, max(first, league.planned_rounds))

    my_pending = (
        db.query(models.Match)
        .filter(
            models.Match.league_id == league.id,
            models.Match.id != match.id,
            models.Match.status.in_(
                [models.MatchStatus.pending, models.MatchStatus.pending_confirmation]
            ),
            or_(
                models.Match.player1_id == user_id,
                models.Match.player2_id == user_id,
            ),
        )
        .all()
    )
    options = []
    for number in range(first, last + 1):
        options.append(
            schemas.RescheduleRoundOptionOut(
                number=number,
                starts_at=_round_starts_at(league, number),
                ends_at=_round_ends_at(league, number),
                my_matches=sum(1 for m in my_pending if m.round_number == number),
            )
        )
    return current_round, options


def _require_not_played_void(match: models.Match) -> None:
    if not match.league_id or not match.league:
        raise HTTPException(status_code=400, detail="אפשר לתאם מחזור אחר רק למשחק ליגה")
    if not _not_played_void(match):
        raise HTTPException(
            status_code=400,
            detail="אפשר לתאם מחזור אחר רק למשחק ששני הצדדים דיווחו שלא שוחק",
        )


@router.get("/{match_id}/reschedule-rounds", response_model=schemas.RescheduleRoundsOut)
def get_reschedule_rounds(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    match = _get_match_for_participant(db, match_id, current_user.id)
    _require_not_played_void(match)
    current_round, options = _reschedule_options(db, match, current_user.id)
    return schemas.RescheduleRoundsOut(
        current_round=current_round,
        original_round=match.round_number,
        options=options,
    )


@router.post("/{match_id}/reschedule-round", response_model=schemas.MatchOut)
def reschedule_to_round(
    match_id: int,
    payload: schemas.RescheduleRoundRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Move a match both players agreed wasn't played into a later round.
    Either of them can do it — the round only decides which window the match
    belongs to, and the time inside it still goes through the usual propose /
    confirm handshake, so neither side can force a slot on the other."""
    _auto_confirm_overdue(db)
    match = _get_match_for_participant(db, match_id, current_user.id)
    _require_not_played_void(match)

    _, options = _reschedule_options(db, match, current_user.id)
    if payload.round_number not in [o.number for o in options]:
        raise HTTPException(status_code=400, detail="אפשר לבחור רק מחזור שעוד לא התחיל")

    # Back to a plain unscheduled league match in its new round: everything
    # the voided attempt left behind is cleared, including the old time so the
    # pair start the scheduling flow from scratch.
    _clear_time_options(db, match)
    match.round_number = payload.round_number
    match.status = models.MatchStatus.pending
    match.scheduled_at = None
    match.scheduled_by = None
    match.schedule_confirmed = False
    match.schedule_proposed_at = None
    match.void_reason = None
    match.reported_by = None
    match.sets = None
    match.player1_score = None
    match.player2_score = None
    match.played_at = None
    match.disputed_at = None
    match.confirmed_by = None
    match.confirmed_at = None
    match.auto_confirm_at = None
    match.last_reminded_at = None
    match.manual_reminded_at = None
    match.auto_remind_count = 0
    match.proposal_remind_count = 0
    match.proposal_reminded_at = None
    db.commit()
    db.refresh(match)

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    opponent = match.player2 if current_user.id == match.player1_id else match.player1
    notify_user(
        db,
        opponent_id,
        "המשחק עבר למחזור אחר",
        f"{current_user.name} תיאם/ה את המשחק שלכם למחזור {match.round_number}. עכשיו צריך לקבוע שעה",
        f"/matches/{match.id}/schedule",
        category="time_proposal",
        type="match_rescheduled",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en="Match moved to another round",
        body_en=f"{current_user.name} moved your match to round {match.round_number}. Now you need to set a time",
    )
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"העברת את המשחק מול {opponent.name if opponent else ''} למחזור {match.round_number}",
        league_id=match.league_id,
        actor_name=current_user.name,
        body_en=f"You moved your match against {opponent.name if opponent else ''} to round {match.round_number}",
    )

    return match


@router.post("/{match_id}/confirm", response_model=schemas.MatchOut)
def confirm_result(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.status != models.MatchStatus.pending_confirmation:
        raise HTTPException(status_code=400, detail="אין תוצאה שממתינה לאישור עבור המשחק הזה")

    confirming_not_played = match.void_reason == "not_played" and match.corrected_sets is None

    if match.corrected_sets is not None:
        # Round 2: only the person who made the original report (or, for a
        # "didn't happen" claim that got a real-score correction, the person
        # who made that claim) can accept the correction that replaces it.
        if current_user.id != match.reported_by:
            raise HTTPException(status_code=400, detail="רק מי שדיווח את התוצאה המקורית יכול לאשר את התיקון")
        match.sets = match.corrected_sets
        match.player1_score = sum(1 for s in match.corrected_sets if s["player1_games"] > s["player2_games"])
        match.player2_score = sum(1 for s in match.corrected_sets if s["player2_games"] > s["player1_games"])
        match.void_reason = None
    elif confirming_not_played:
        # Agreeing the match never happened — the opposite side of the
        # claim confirms it, same as confirming a score, but nothing here
        # is a self-confirm since the claim has no sets to self-report.
        if current_user.id == match.reported_by:
            raise HTTPException(status_code=400, detail="לא ניתן לאשר דיווח שהגשת בעצמך")
    else:
        if current_user.id == match.reported_by:
            raise HTTPException(status_code=400, detail="לא ניתן לאשר תוצאה שדיווחת בעצמך")

    if confirming_not_played:
        match.status = models.MatchStatus.disputed
        match.disputed_at = datetime.utcnow()
        # Recording the confirmer is what separates "we both said so" from a
        # claim that stood because nobody ever answered it.
        match.confirmed_by = current_user.id
        match.confirmed_at = match.disputed_at
        db.commit()
        db.refresh(match)

        other_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
        other = match.player2 if current_user.id == match.player1_id else match.player1
        notify_user(
            db,
            other_id,
            "אושר שהמשחק לא בוצע",
            f"{current_user.name} אישר/ה שהמשחק שלכם לא התקיים — הוא בוטל ולא ייספר בתוצאות",
            f"/matches/{match.id}",
            type="match_voided",
            actor_name=current_user.name,
            league_id=match.league_id,
            match_id=match.id,
            title_en="Confirmed as not played",
            body_en=f"{current_user.name} confirmed your match never happened — it is voided and won't count",
        )
        resolve_match_notifications(
            db,
            current_user.id,
            match.id,
            f"אישרת שהמשחק מול {other.name if other else ''} לא התקיים. הוא לא ייספר בתוצאות",
            league_id=match.league_id,
            actor_name=current_user.name,
            body_en=f"You confirmed that your match against {other.name if other else ''} never happened. It won't count",
        )
        return match

    match.status = models.MatchStatus.completed
    match.confirmed_by = current_user.id
    match.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(match)
    update_ratings_for_match(db, match)

    other_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    other = match.player2 if current_user.id == match.player1_id else match.player1
    # 155a's update line: what changed for the player is their rating, so say
    # it. update_ratings_for_match just wrote the sample this reads.
    level_note = ""
    sample = (
        db.query(models.RatingSample)
        .filter(models.RatingSample.user_id == other_id, models.RatingSample.match_id == match.id)
        .order_by(models.RatingSample.id.desc())
        .first()
    )
    level_note_en = ""
    if sample:
        direction = "עלה" if sample.level_after > sample.level_before else "ירד"
        direction_en = "went up" if sample.level_after > sample.level_before else "went down"
        if abs(sample.level_after - sample.level_before) < 0.005:
            level_note = f". הדירוג שלך נשאר {sample.level_after:.1f}"
            level_note_en = f". Your rating stays {sample.level_after:.1f}"
        else:
            level_note = f". הדירוג שלך {direction} ל־{sample.level_after:.1f}"
            level_note_en = f". Your rating {direction_en} to {sample.level_after:.1f}"
    notify_user(
        db,
        other_id,
        "התוצאה אושרה",
        f"התוצאה מול {current_user.name} אושרה{level_note}",
        f"/matches/{match.id}",
        type="result_confirmed",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en="Result confirmed",
        body_en=f"The result against {current_user.name} is confirmed{level_note_en}",
    )
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"אישרת את התוצאה מול {other.name if other else ''}",
        league_id=match.league_id,
        actor_name=current_user.name,
        body_en=f"You confirmed the result against {other.name if other else ''}",
    )

    return match


@router.post("/{match_id}/dispute", response_model=schemas.MatchOut)
def dispute_result(
    match_id: int,
    correction: schemas.MatchCorrection,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.status != models.MatchStatus.pending_confirmation:
        raise HTTPException(status_code=400, detail="אין תוצאה לערער עליה")
    if match.corrected_sets is not None:
        raise HTTPException(status_code=400, detail="כבר נשלח תיקון למשחק הזה")
    if current_user.id == match.reported_by:
        raise HTTPException(status_code=400, detail="לא ניתן לערער על תוצאה שדיווחת בעצמך")
    if not correction.sets:
        raise HTTPException(status_code=400, detail="צריך לדווח לפחות סט אחד")

    max_sets = match.league.best_of if match.league_id else FRIENDLY_MAX_SETS
    max_sets = max_sets or FRIENDLY_MAX_SETS
    if len(correction.sets) > max_sets:
        raise HTTPException(status_code=400, detail=f"אפשר לדווח עד {max_sets} סטים")

    # The client always submits sets "my games first" (matching what it's shown
    # via _mine_first), so flip back to the match's own player1/player2
    # orientation before storing — same convention as report_score expects,
    # except that endpoint's caller is always oriented to the DB already.
    i_am_player1 = current_user.id == match.player1_id
    match.corrected_by = current_user.id
    match.corrected_sets = (
        [s.model_dump() for s in correction.sets]
        if i_am_player1
        else [{"player1_games": s.player2_games, "player2_games": s.player1_games} for s in correction.sets]
    )
    match.dispute_note = correction.note
    match.auto_confirm_at = datetime.utcnow() + CONFIRMATION_WINDOW
    db.commit()
    db.refresh(match)

    reporter = match.player1 if match.reported_by == match.player1_id else match.player2
    notify_user(
        db,
        match.reported_by,
        "תיקון לתוצאה",
        f"{current_user.name} שלח/ה תיקון לתוצאה שדיווחת, וממתין/ה לתשובה שלך",
        f"/matches/{match.id}",
        type="dispute_reported",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
        title_en="A correction to the result",
        body_en=f"{current_user.name} sent a correction to the score you reported, and is waiting for your answer",
    )
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"ביקשת לתקן את התוצאה מול {reporter.name if reporter else ''}. מחכה לתשובה שלו/ה",
        league_id=match.league_id,
        actor_name=current_user.name,
        body_en=f"You asked to correct the result against {reporter.name if reporter else ''}. Waiting for their answer",
    )

    return match


@router.post("/{match_id}/dispute/reject", response_model=schemas.MatchOut)
def reject_correction(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.status != models.MatchStatus.pending_confirmation or match.corrected_sets is None:
        raise HTTPException(status_code=400, detail="אין תיקון לדחות")
    if current_user.id != match.reported_by:
        raise HTTPException(status_code=400, detail="רק מי שדיווח את התוצאה המקורית יכול לדחות את התיקון")

    match.status = models.MatchStatus.disputed
    match.disputed_at = datetime.utcnow()
    db.commit()
    db.refresh(match)

    notify_user(
        db,
        match.corrected_by,
        "המשחק נכנס למחלוקת",
        f"{current_user.name} דחה/תה את התיקון שלך — המשחק לא ייספר בטבלה",
        f"/matches/{match.id}",
        title_en="The match is in dispute",
        body_en=f"{current_user.name} rejected your correction — the match won't count in the table",
    )

    return match


@router.post("/{match_id}/dispute/cancel", response_model=schemas.MatchOut)
def cancel_correction(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Lets the person who sent a correction (needsyou112a.md's "CORRECTION
    SENT · WAITING" tile) withdraw it before the original reporter has acted
    on it, reverting the match to their still-standing original report."""
    match = _get_match_for_participant(db, match_id, current_user.id)
    if match.status != models.MatchStatus.pending_confirmation or match.corrected_sets is None:
        raise HTTPException(status_code=400, detail="אין תיקון לבטל")
    if current_user.id != match.corrected_by:
        raise HTTPException(status_code=400, detail="רק מי ששלח את התיקון יכול לבטל אותו")

    match.corrected_by = None
    match.corrected_sets = None
    match.dispute_note = None
    match.auto_confirm_at = datetime.utcnow() + CONFIRMATION_WINDOW
    db.commit()
    db.refresh(match)

    return match
