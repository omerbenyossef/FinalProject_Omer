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
        reported_sets=_mine_first(match.sets),
        corrected_by=match.corrected_by,
        corrected_sets=_mine_first(match.corrected_sets),
        dispute_note=match.dispute_note,
        disputed_at=match.disputed_at,
        void_reason=match.void_reason,
        auto_confirm_at=match.auto_confirm_at,
        prediction=prediction,
        time_options=match.time_options,
        busy_windows=_busy_windows(db, match, current_user.id),
        conflict_gap_minutes=int(CONFLICT_GAP_WINDOW.total_seconds() // 60),
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
    now = datetime.utcnow()
    opponent_id = match.player2_id if viewer_id == match.player1_id else match.player1_id
    by_window: dict[tuple[datetime, datetime], set[str]] = {}
    for user_id, whose in ((viewer_id, "me"), (opponent_id, "opponent")):
        for other in _other_confirmed_matches(db, user_id, match.id):
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
    if match.kind == models.MatchKind.friendly and match.invite_status != models.FriendlyInviteStatus.accepted:
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
    match.duration_minutes = duration_minutes
    db.commit()
    db.refresh(match)

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    body = (
        f"{current_user.name} הציע/ה שעה למשחק שלכם, ומחכה לאישור שלך"
        if len(starts) == 1
        else f"{current_user.name} הציע/ה {len(starts)} זמנים למשחק שלכם, בחר/י אחד מהם"
    )
    notify_user(
        db,
        opponent_id,
        "הצעת זמן למשחק",
        body,
        f"/matches/{match.id}",
        category="time_proposal",
        type="time_proposed",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
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
    _clear_time_options(db, match)
    db.commit()
    db.refresh(match)

    _auto_decline_conflicting_proposals(db, match, start, end)

    proposer = match.player1 if match.scheduled_by == match.player1_id else match.player2
    notify_user(
        db,
        match.scheduled_by,
        "הזמן למשחק אושר",
        f"{current_user.name} אישר/ה את הזמן שהצעת למשחק שלכם",
        f"/matches/{match.id}",
        category="time_proposal",
        type="time_confirmed",
        actor_name=current_user.name,
        league_id=match.league_id,
        match_id=match.id,
    )
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"אישרת את הזמן למשחק מול {proposer.name if proposer else ''}",
        league_id=match.league_id,
        actor_name=current_user.name,
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
    )

    return match


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
    if match.scheduled_at is None or not match.schedule_confirmed:
        raise HTTPException(status_code=400, detail="צריך לתאם ולאשר שעה למשחק לפני שאפשר לדווח שהוא לא בוצע")
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
    )
    opponent = match.player2 if current_user.id == match.player1_id else match.player1
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"דיווחת שהמשחק מול {opponent.name if opponent else ''} לא התקיים. מחכה לאישור שלו/ה",
        league_id=match.league_id,
        actor_name=current_user.name,
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
        )
        resolve_match_notifications(
            db,
            current_user.id,
            match.id,
            f"אישרת שהמשחק מול {other.name if other else ''} לא התקיים. הוא לא ייספר בתוצאות",
            league_id=match.league_id,
            actor_name=current_user.name,
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
    if sample:
        direction = "עלה" if sample.level_after > sample.level_before else "ירד"
        if abs(sample.level_after - sample.level_before) < 0.005:
            level_note = f". הדירוג שלך נשאר {sample.level_after:.1f}"
        else:
            level_note = f". הדירוג שלך {direction} ל־{sample.level_after:.1f}"
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
    )
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"אישרת את התוצאה מול {other.name if other else ''}",
        league_id=match.league_id,
        actor_name=current_user.name,
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
    )
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"ביקשת לתקן את התוצאה מול {reporter.name if reporter else ''}. מחכה לתשובה שלו/ה",
        league_id=match.league_id,
        actor_name=current_user.name,
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
