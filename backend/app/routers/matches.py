from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..match_cleanup import purge_match_references
from ..push_utils import notify_user, resolve_match_notifications
from ..rating_utils import update_ratings_for_match

router = APIRouter(prefix="/leagues/{league_id}/matches", tags=["matches"])

# How long silence takes to finalize a reported result. Nobody asked for it to
# happen, so the window is long enough that a player who only opens the app
# every couple of days still gets a say, and _auto_remind_pending_confirmations
# nags them each day until it closes.
CONFIRMATION_WINDOW = timedelta(hours=72)
REMIND_COOLDOWN = timedelta(hours=1)
AUTO_REMIND_INTERVAL = timedelta(hours=24)
MAX_AUTO_REMINDS = 3
AUTO_VOID_INTERVAL = timedelta(days=4)
# A friendly that never got off the ground — an invitation nobody answered, or
# one that was accepted and never given a time — is a non-event. It goes
# quietly a week after the last thing that happened to it.
FRIENDLY_IDLE_INTERVAL = timedelta(days=7)
PROPOSAL_REMIND_INTERVAL = timedelta(hours=24)
MAX_PROPOSAL_REMINDS = 2


def _to_naive_utc(dt: datetime) -> datetime:
    """Everything else in this codebase stores/compares naive UTC datetimes
    (datetime.utcnow()); a client-submitted ISO timestamp may arrive
    timezone-aware, so normalize it before it touches the DB or gets
    compared against datetime.utcnow()."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _claim_match(db: Session, match_id: int, values: dict, *still_true) -> bool:
    """Take a match off the pile before acting on it, and say whether we got it.

    There is no scheduler here: every sweep below runs on every request that
    reads match data, and the app fires several of those at once when it
    opens. Each of them used to see the same overdue match, act on it, and
    tell both players — five identical pushes for one event, and in
    _auto_confirm_overdue's case two rating changes for one result.

    The update carries the condition that made the match eligible, so only the
    first caller to reach it changes a row; everyone else gets zero back and
    leaves it alone. Postgres re-checks the predicate after the row lock, and
    SQLite serializes writes outright, so on both the claim is exclusive."""
    claimed = (
        db.query(models.Match)
        .filter(models.Match.id == match_id, *still_true)
        .update(values, synchronize_session=False)
    )
    db.commit()
    return claimed == 1


def _auto_confirm_overdue(db: Session) -> None:
    """Opportunistic sweep run on every match read: there's no background
    scheduler, so a match past its auto_confirm_at is finalized lazily the
    next time anyone looks at match data, instead of on a timer. Also runs
    the overdue-reminder sweep below, for the same reason — one call site
    to add wherever match data gets touched."""
    now = datetime.utcnow()
    overdue = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.pending_confirmation,
            models.Match.auto_confirm_at.isnot(None),
            models.Match.auto_confirm_at <= now,
        )
        .all()
    )
    completed, voided = [], []
    for match in overdue:
        if match.void_reason == "not_played" and match.corrected_sets is None:
            # A "match didn't happen" claim nobody answered — there's no
            # score to fall back on (unlike a normal disputed report), so
            # silence resolves it to voided rather than completed.
            values = {
                models.Match.status: models.MatchStatus.disputed,
                models.Match.disputed_at: now,
            }
            bucket = voided
        elif match.void_reason == "not_played" and match.corrected_sets is not None:
            # The other side said "we did play, here's the score" and got
            # no response — favor that real score over an empty not-played
            # claim, since there's nothing else to silently keep.
            values = {
                models.Match.sets: match.corrected_sets,
                models.Match.player1_score: sum(
                    1 for s in match.corrected_sets if s["player1_games"] > s["player2_games"]
                ),
                models.Match.player2_score: sum(
                    1 for s in match.corrected_sets if s["player2_games"] > s["player1_games"]
                ),
                models.Match.void_reason: None,
                models.Match.status: models.MatchStatus.completed,
                models.Match.confirmed_by: None,
                models.Match.confirmed_at: now,
            }
            bucket = completed
        else:
            values = {
                models.Match.status: models.MatchStatus.completed,
                models.Match.confirmed_by: None,
                models.Match.confirmed_at: now,
            }
            bucket = completed
        # Still pending_confirmation, or another request already finalized it —
        # and running the ratings twice would move both players twice.
        if _claim_match(
            db, match.id, values, models.Match.status == models.MatchStatus.pending_confirmation
        ):
            db.refresh(match)
            bucket.append(match)
    if completed or voided:
        for match in completed:
            update_ratings_for_match(db, match)
            # Neither player asked for this to happen (that's the point of
            # auto-confirm — silence past the 48h window finalizes it) so
            # both, not just whoever didn't report, learn their match is
            # now final instead of finding out only if they check back.
            url = f"/leagues/{match.league_id}" if match.league_id else "/profile"
            for player_id in (match.player1_id, match.player2_id):
                notify_user(
                    db,
                    player_id,
                    "המשחק אושר אוטומטית",
                    "התוצאה לא אושרה בזמן, אז המשחק שלכם ננעל אוטומטית ונספר בתוצאות",
                    url,
                    type="auto_confirmed",
                    league_id=match.league_id,
                    match_id=match.id,
                    title_en="Match closed automatically",
                    body_en="The result wasn't confirmed in time, so your match was locked automatically and counted",
                )
        for match in voided:
            url = f"/leagues/{match.league_id}" if match.league_id else "/profile"
            for player_id in (match.player1_id, match.player2_id):
                notify_user(
                    db,
                    player_id,
                    "המשחק בוטל אוטומטית",
                    "הדיווח שהמשחק לא בוצע לא אושר או נדחה בזמן, אז המשחק בוטל ולא ייספר בתוצאות",
                    url,
                    type="match_voided",
                    league_id=match.league_id,
                    match_id=match.id,
                    title_en="Match voided automatically",
                    body_en="Nobody answered the report that the match wasn't played, so it was voided and won't count",
                )

    _auto_remind_overdue_matches(db)
    _auto_remind_pending_confirmations(db)
    _auto_remind_pending_proposals(db)
    _expire_passed_friendly_times(db)
    _auto_void_abandoned_friendlies(db)


def _auto_remind_pending_confirmations(db: Session) -> None:
    """Companion sweep: a reported result finalizes on its own once its window
    runs out, and the only notice the player owing an answer used to get was
    the one sent the moment it was reported. Nag them every 24h while the
    window is open, so nothing goes final on someone who never heard."""
    now = datetime.utcnow()
    threshold = now - AUTO_REMIND_INTERVAL
    waiting = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.pending_confirmation,
            models.Match.auto_confirm_at.isnot(None),
            models.Match.auto_confirm_at > now,
            or_(
                models.Match.confirm_remind_count.is_(None),
                models.Match.confirm_remind_count < MAX_AUTO_REMINDS,
            ),
            or_(
                models.Match.confirm_reminded_at.is_(None),
                models.Match.confirm_reminded_at <= threshold,
            ),
            # Nothing to nag about in the first day — they were told when it
            # was reported.
            models.Match.auto_confirm_at <= now + CONFIRMATION_WINDOW - AUTO_REMIND_INTERVAL,
        )
        .all()
    )
    # Claimed on the same condition that selected it, so twelve requests at
    # once send one reminder rather than twelve.
    waiting = [
        match
        for match in waiting
        if _claim_match(
            db,
            match.id,
            {
                models.Match.confirm_remind_count: (match.confirm_remind_count or 0) + 1,
                models.Match.confirm_reminded_at: now,
            },
            or_(
                models.Match.confirm_reminded_at.is_(None),
                models.Match.confirm_reminded_at <= threshold,
            ),
        )
    ]
    for match in waiting:
        # Whoever moved last isn't the one being waited on: normally that's the
        # reporter, but once a correction is in it's the reporter who owes the
        # answer.
        owes_answer = match.reported_by if match.corrected_sets is not None else (
            match.player2_id if match.reported_by == match.player1_id else match.player1_id
        )
        other = match.player2 if owes_answer == match.player1_id else match.player1
        hours_left = max(1, int((match.auto_confirm_at - now).total_seconds() // 3600))
        notify_user(
            db,
            owes_answer,
            "תוצאה מחכה לאישור שלך",
            f"התוצאה מול {other.name} עוד מחכה לתשובה שלך. בעוד {hours_left} שעות היא תאושר מעצמה.",
            f"/matches/{match.id}",
            type="confirm_reminder",
            league_id=match.league_id,
            match_id=match.id,
            title_en="A result is waiting for you",
            body_en=(
                f"Your result against {other.name} is still waiting on your answer."
                f" In {hours_left} hours it confirms on its own."
            ),
        )


def _auto_remind_overdue_matches(db: Session) -> None:
    """Companion sweep, called from _auto_confirm_overdue above: nags both
    players on a confirmed, not-yet-reported match once its scheduled time
    has passed, every 24h, up to 3 times total."""
    now = datetime.utcnow()
    threshold = now - AUTO_REMIND_INTERVAL
    overdue = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.pending,
            models.Match.schedule_confirmed.is_(True),
            models.Match.scheduled_at.isnot(None),
            models.Match.scheduled_at <= threshold,
            or_(
                models.Match.auto_remind_count.is_(None),
                models.Match.auto_remind_count < MAX_AUTO_REMINDS,
            ),
            or_(
                models.Match.last_reminded_at.is_(None),
                models.Match.last_reminded_at <= threshold,
            ),
        )
        .all()
    )
    overdue = [
        match
        for match in overdue
        if _claim_match(
            db,
            match.id,
            {
                models.Match.auto_remind_count: (match.auto_remind_count or 0) + 1,
                models.Match.last_reminded_at: now,
            },
            or_(
                models.Match.last_reminded_at.is_(None),
                models.Match.last_reminded_at <= threshold,
            ),
        )
    ]
    if overdue:
        for match in overdue:
            url = f"/leagues/{match.league_id}" if match.league_id else "/profile"
            for player_id in (match.player1_id, match.player2_id):
                notify_user(
                    db,
                    player_id,
                    "תזכורת: יש משחק לדווח",
                    "המשחק שלכם כבר היה אמור להתקיים ועדיין לא דיווחתם תוצאה",
                    url,
                    type="report_reminder",
                    league_id=match.league_id,
                    match_id=match.id,
                    title_en="Reminder: a match to report",
                    body_en="Your match has already passed and no result was reported",
                )


def _auto_remind_pending_proposals(db: Session) -> None:
    """A proposal nobody answers is the quietest way for a match to die: the
    round runs out and the whole thing lands in the void sweep. Nag the player
    who owes the answer once a day, twice, while the offer is still in the
    future."""
    now = datetime.utcnow()
    threshold = now - PROPOSAL_REMIND_INTERVAL
    waiting = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.pending,
            models.Match.schedule_confirmed.is_(False),
            models.Match.scheduled_at.isnot(None),
            models.Match.scheduled_at > now,
            models.Match.scheduled_by.isnot(None),
            models.Match.schedule_proposed_at.isnot(None),
            models.Match.schedule_proposed_at <= threshold,
            or_(
                models.Match.proposal_remind_count.is_(None),
                models.Match.proposal_remind_count < MAX_PROPOSAL_REMINDS,
            ),
            or_(
                models.Match.proposal_reminded_at.is_(None),
                models.Match.proposal_reminded_at <= threshold,
            ),
        )
        .all()
    )
    waiting = [
        match
        for match in waiting
        if _claim_match(
            db,
            match.id,
            {
                models.Match.proposal_remind_count: (match.proposal_remind_count or 0) + 1,
                models.Match.proposal_reminded_at: now,
            },
            or_(
                models.Match.proposal_reminded_at.is_(None),
                models.Match.proposal_reminded_at <= threshold,
            ),
        )
    ]
    if waiting:
        for match in waiting:
            proposer = db.query(models.User).filter(models.User.id == match.scheduled_by).first()
            recipient_id = (
                match.player2_id if match.scheduled_by == match.player1_id else match.player1_id
            )
            name = proposer.name if proposer else ""
            count = len(match.time_options)
            body = (
                f"{name} מחכה לתשובה שלך על {count} הזמנים שהציע/ה למשחק שלכם"
                if count > 1
                else f"{name} מחכה לתשובה שלך על השעה שהציע/ה למשחק שלכם"
            )
            body_en = (
                f"{name} is waiting for your answer on the {count} times they proposed"
                if count > 1
                else f"{name} is waiting for your answer on the time they proposed"
            )
            notify_user(
                db,
                recipient_id,
                "הצעת זמן מחכה לך",
                body,
                f"/matches/{match.id}",
                category="time_proposal",
                type="time_reminder",
                actor_name=name,
                league_id=match.league_id,
                match_id=match.id,
                title_en="A time proposal is waiting",
                body_en=body_en,
            )


def _expire_passed_friendly_times(db: Session) -> None:
    """A time one player put forward, the other never confirmed, and which has
    now come and gone. There is nothing left to agree to — confirming it would
    mean agreeing to an hour that is already behind them, and the server
    refuses that anyway — so the screen asking for it is a dead end.

    For a friendly the whole thing is let go: nobody is obliged to play it, and
    a league's schedule doesn't depend on it. The player who proposed the time
    is told, because from their side a match they arranged simply vanishes."""
    now = datetime.utcnow()
    stale = (
        db.query(models.Match)
        .filter(
            models.Match.kind == models.MatchKind.friendly,
            models.Match.status == models.MatchStatus.pending,
            models.Match.schedule_confirmed.is_(False),
            models.Match.scheduled_at.isnot(None),
            models.Match.scheduled_at < now,
        )
        .all()
    )
    for match in stale:
        target, proposer_id = match.id, match.scheduled_by
        p1, p2 = match.player1_id, match.player2_id
        # Exactly what cancelling a friendly does (see cancel_match): the time
        # goes, and the match is marked declined — the state every list already
        # reads as "this one is over". Not a voided match: nothing was ever
        # agreed here, so there is no match that failed to happen.
        if not _claim_match(
            db,
            target,
            {
                models.Match.scheduled_at: None,
                models.Match.scheduled_by: None,
                models.Match.schedule_confirmed: False,
                models.Match.schedule_proposed_at: None,
                models.Match.court: None,
                models.Match.venue_id: None,
                models.Match.duration_minutes: None,
                models.Match.invite_status: models.FriendlyInviteStatus.declined,
            },
            models.Match.scheduled_at.isnot(None),
        ):
            continue
        db.query(models.MatchTimeOption).filter(
            models.MatchTimeOption.match_id == target
        ).delete(synchronize_session=False)
        db.commit()

        if proposer_id is None:
            continue
        other_id = p2 if proposer_id == p1 else p1
        other = db.get(models.User, other_id)
        name = other.name if other else ""
        # The other player was the one being nagged to answer; the thing they
        # were being nagged about no longer exists.
        resolve_match_notifications(
            db,
            other_id,
            target,
            "ההצעה למשחק פגה — הזמן שהוצע עבר",
            body_en="The proposed time passed, so the match proposal expired",
        )
        notify_user(
            db,
            proposer_id,
            "ההצעה למשחק בוטלה",
            f"{name} לא אישר/ה את הזמן שהצעת לפני שהוא עבר, אז ההצעה בוטלה",
            "/profile",
            type="proposal_expired",
            match_id=target,
            title_en="Match proposal cancelled",
            body_en=f"{name} didn't confirm the time before it passed, so the proposal was cancelled",
        )


def _auto_void_abandoned_friendlies(db: Session) -> None:
    """Companion sweep, called from _auto_confirm_overdue above: a friendly
    match that's sat completely unreported (no score, not even a "didn't
    happen" claim) for AUTO_VOID_INTERVAL past its scheduled time is
    abandoned — auto-void it the same way a mutually-agreed "didn't happen"
    report would, so it doesn't linger in "to play" lists forever. Scoped
    to friendly matches only: a stale league match instead surfaces to the
    league's admin via the ops "stalled" flag rather than disappearing on
    its own, since it affects that league's schedule and standings."""
    now = datetime.utcnow()
    threshold = now - AUTO_VOID_INTERVAL
    abandoned = (
        db.query(models.Match)
        .filter(
            models.Match.kind == models.MatchKind.friendly,
            models.Match.status == models.MatchStatus.pending,
            models.Match.schedule_confirmed.is_(True),
            models.Match.scheduled_at.isnot(None),
            models.Match.scheduled_at <= threshold,
        )
        .all()
    )
    abandoned = [
        match
        for match in abandoned
        if _claim_match(
            db,
            match.id,
            {
                models.Match.status: models.MatchStatus.disputed,
                models.Match.void_reason: "not_played",
                models.Match.disputed_at: now,
            },
            models.Match.status == models.MatchStatus.pending,
        )
    ]
    if abandoned:
        for match in abandoned:
            for player_id in (match.player1_id, match.player2_id):
                notify_user(
                    db,
                    player_id,
                    "המשחק בוטל אוטומטית",
                    "המשחק שלכם עבר זמן רב מהמועד שנקבע ואף אחד לא דיווח עליו, אז הוא בוטל ולא ייספר",
                    "/profile",
                    type="match_voided",
                    match_id=match.id,
                    title_en="Match voided automatically",
                    body_en="Your match is long past its time and nobody reported it, so it was voided and won't count",
                )

    # The other half: friendlies that never reached a confirmed time at all.
    # Nothing happened to announce, so these are dropped without a word —
    # they just stop showing up.
    idle_threshold = now - FRIENDLY_IDLE_INTERVAL
    idle = [
        match
        for match in db.query(models.Match)
        .filter(
            models.Match.kind == models.MatchKind.friendly,
            models.Match.status == models.MatchStatus.pending,
            or_(
                models.Match.schedule_confirmed.is_(False),
                models.Match.scheduled_at.is_(None),
            ),
        )
        .all()
        if (match.scheduled_at or match.created_at) is not None
        and (match.scheduled_at or match.created_at) <= idle_threshold
    ]
    for match in idle:
        match.status = models.MatchStatus.disputed
        match.void_reason = "not_played"
        match.disputed_at = now
    if idle:
        db.commit()


def _round_robin_rounds(player_ids: list[int]) -> list[list[tuple[int, int]]]:
    """Circle-method round robin: each round pairs every player with exactly
    one opponent (one player sits out a round if the count is odd), so a
    "round" maps naturally to "everyone's match for that week"."""
    players = list(player_ids)
    if len(players) % 2 == 1:
        players.append(None)

    n = len(players)
    rounds = []
    for _ in range(n - 1):
        pairs = []
        for i in range(n // 2):
            p1, p2 = players[i], players[n - 1 - i]
            if p1 is not None and p2 is not None:
                pairs.append((p1, p2))
        rounds.append(pairs)
        players = [players[0]] + [players[-1]] + players[1:-1]
    return rounds


def _require_member(db: Session, league_id: int, user_id: int) -> None:
    membership = (
        db.query(models.LeagueMembership)
        .filter(
            models.LeagueMembership.league_id == league_id,
            models.LeagueMembership.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="You must join the league first")


@router.get("/", response_model=list[schemas.MatchOut])
def list_matches(
    league_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
        .filter(
            models.Match.league_id == league_id,
            or_(
                models.Match.player1_id == current_user.id,
                models.Match.player2_id == current_user.id,
            ),
        )
        .order_by(models.Match.created_at.desc())
        .all()
    )
    return matches


@router.get("/all", response_model=list[schemas.MatchOut])
def list_all_matches(league_id: int, db: Session = Depends(get_db)):
    _auto_confirm_overdue(db)
    matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.player1), joinedload(models.Match.player2))
        .filter(models.Match.league_id == league_id)
        .order_by(models.Match.created_at.desc())
        .all()
    )
    return matches


@router.post("/generate-schedule", response_model=list[schemas.MatchOut])
def generate_schedule(
    league_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    league = db.query(models.League).filter(models.League.id == league_id).first()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if league.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="רק יוצר הליגה יכול ליצור לוח משחקים")

    # Deduplicated: uq_league_user should make a repeat row impossible, but
    # the circle method below pairs players by position, so the same id twice
    # in this list is the same id on both sides of a match — a player drawn
    # against themselves. Too cheap a guard to leave to a constraint.
    seen: set[int] = set()
    member_ids = []
    for m in (
        db.query(models.LeagueMembership)
        .filter(models.LeagueMembership.league_id == league_id)
        .order_by(models.LeagueMembership.id)
        .all()
    ):
        if m.user_id not in seen:
            seen.add(m.user_id)
            member_ids.append(m.user_id)
    if len(member_ids) < 2:
        raise HTTPException(status_code=400, detail="צריך לפחות 2 שחקנים כדי ליצור לוח משחקים")

    existing_matches = db.query(models.Match).filter(models.Match.league_id == league_id).all()
    existing_pairs = {frozenset((m.player1_id, m.player2_id)) for m in existing_matches}
    max_existing_round = max((m.round_number or 0 for m in existing_matches), default=0)

    ideal_rounds = _round_robin_rounds(member_ids)

    created = []
    next_round_number = max_existing_round + 1
    for round_pairs in ideal_rounds:
        new_pairs = [pair for pair in round_pairs if frozenset(pair) not in existing_pairs]
        if not new_pairs:
            continue
        for p1, p2 in new_pairs:
            if p1 == p2:
                continue
            match = models.Match(
                league_id=league_id, player1_id=p1, player2_id=p2, round_number=next_round_number
            )
            db.add(match)
            created.append(match)
        next_round_number += 1

    if league.schedule_started_at is None:
        # The rounds are counted from this anchor, and the creator already said
        # which day the league opens — so they run from that day rather than
        # from whenever this button happened to be pressed. Generating the
        # schedule a week early no longer opens round 1 a week early.
        league.schedule_started_at = league.starts_at or datetime.utcnow()

    db.commit()
    for match in created:
        db.refresh(match)

    if created:
        # notifications155a.md wants this to say what actually changed for the
        # player, so each one hears their own pairing rather than "a schedule
        # was created".
        opponent_by_member: dict[int, str] = {}
        round_by_member: dict[int, int] = {}
        for match in created:
            for player, other in ((match.player1, match.player2), (match.player2, match.player1)):
                if player and other:
                    opponent_by_member[player.id] = other.name
                    round_by_member[player.id] = match.round_number
        for member_id in member_ids:
            if member_id == current_user.id:
                continue
            opponent_name = opponent_by_member.get(member_id)
            round_number = round_by_member.get(member_id)
            if opponent_name and round_number:
                body = f"מחזור {round_number} נפתח. היריב שלך: {opponent_name}"
                body_en = f"Round {round_number} is open. Your opponent: {opponent_name}"
            else:
                body = f"נוצר לוח משחקים חדש בליגה {league.name}"
                body_en = f"A new schedule was created in {league.name}"
            notify_user(
                db,
                member_id,
                "לוח משחקים חדש",
                body,
                f"/leagues/{league_id}",
                category="round_open",
                type="round_open",
                league_id=league.id,
                title_en="A new schedule",
                body_en=body_en,
            )

    return created


@router.post("/", response_model=schemas.MatchOut)
def create_match(
    league_id: int,
    match_in: schemas.MatchCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if match_in.opponent_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot challenge yourself")

    _require_member(db, league_id, current_user.id)
    _require_member(db, league_id, match_in.opponent_id)

    match = models.Match(
        league_id=league_id,
        player1_id=current_user.id,
        player2_id=match_in.opponent_id,
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return match


@router.post("/{match_id}/score", response_model=schemas.MatchOut)
def report_score(
    league_id: int,
    match_id: int,
    score_in: schemas.MatchScoreUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    match = (
        db.query(models.Match)
        .filter(models.Match.id == match_id, models.Match.league_id == league_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="Not a participant in this match")
    # match-pending-confirm-159a: whoever filed the report can still change it
    # while the opponent hasn't answered — editing replaces the report and
    # restarts the wait. Anyone else still can't touch a reported match.
    editing_own_report = (
        match.status == models.MatchStatus.pending_confirmation
        and match.reported_by == current_user.id
        and match.corrected_sets is None
    )
    if match.status != models.MatchStatus.pending and not editing_own_report:
        raise HTTPException(status_code=400, detail="כבר יש תוצאה למשחק הזה — אפשר רק לאשר אותה או לערער עליה")
    if not editing_own_report:
        if match.scheduled_at is None or not match.schedule_confirmed:
            raise HTTPException(status_code=400, detail="צריך לתאם ולאשר שעה למשחק לפני דיווח תוצאה")
        if datetime.utcnow() < match.scheduled_at:
            raise HTTPException(status_code=400, detail="אפשר לדווח תוצאה רק אחרי השעה שנקבעה למשחק")
    if not score_in.sets:
        raise HTTPException(status_code=400, detail="צריך לדווח לפחות סט אחד")
    best_of = match.league.best_of or 3
    if len(score_in.sets) > best_of:
        raise HTTPException(status_code=400, detail=f"אפשר לדווח עד {best_of} סטים בליגה הזו")

    match.sets = [s.model_dump() for s in score_in.sets]
    match.player1_score = sum(1 for s in score_in.sets if s.player1_games > s.player2_games)
    match.player2_score = sum(1 for s in score_in.sets if s.player2_games > s.player1_games)
    match.played_at = datetime.utcnow()
    match.status = models.MatchStatus.pending_confirmation
    match.reported_by = current_user.id
    # An edit (or "we actually played after all") replaces whatever was filed
    # before, including a "didn't happen" claim, and the opponent gets a fresh
    # window to answer in.
    match.void_reason = None
    match.manual_reminded_at = None
    match.confirmed_by = None
    match.confirmed_at = None
    match.auto_confirm_at = datetime.utcnow() + CONFIRMATION_WINDOW
    db.commit()
    db.refresh(match)

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    opponent = match.player2 if current_user.id == match.player1_id else match.player1
    notify_user(
        db,
        opponent_id,
        "יש תוצאה לאישור",
        f"{current_user.name} דיווח תוצאה למשחק שלכם, ומחכה לאישור שלך",
        f"/leagues/{league_id}",
        type="result_reported",
        actor_name=current_user.name,
        league_id=league_id,
        match_id=match.id,
        title_en="A result to confirm",
        body_en=f"{current_user.name} reported a score for your match and is waiting for you",
    )
    resolve_match_notifications(
        db,
        current_user.id,
        match.id,
        f"דיווחת תוצאה במשחק מול {opponent.name if opponent else ''}. מחכה לאישור שלו/ה",
        league_id=league_id,
        actor_name=current_user.name,
        body_en=f"You reported the score against {opponent.name if opponent else ''}. Waiting for them to confirm",
    )

    return match


@router.post("/{match_id}/remind", status_code=status.HTTP_204_NO_CONTENT)
def remind_score(
    league_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = (
        db.query(models.Match)
        .filter(models.Match.id == match_id, models.Match.league_id == league_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="Not a participant in this match")
    if match.status not in (models.MatchStatus.pending, models.MatchStatus.pending_confirmation):
        raise HTTPException(status_code=400, detail="אין מה להזכיר במשחק הזה")
    if match.last_reminded_at is not None and datetime.utcnow() - match.last_reminded_at < REMIND_COOLDOWN:
        raise HTTPException(status_code=429, detail="כבר נשלחה תזכורת למשחק הזה לאחרונה")

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    if match.status == models.MatchStatus.pending_confirmation:
        title, body = "תזכורת: יש תוצאה לאישור", f"{current_user.name} מזכיר/ה לך לאשר את התוצאה שדווחה"
    else:
        title, body = "תזכורת למשחק", f"{current_user.name} מזכיר/ה לך לשחק ולדווח את המשחק שלכם"
    notify_user(db, opponent_id, title, body, f"/leagues/{league_id}")
    match.last_reminded_at = datetime.utcnow()
    db.commit()

    return match


@router.delete("/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_match(
    league_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = (
        db.query(models.Match)
        .filter(models.Match.id == match_id, models.Match.league_id == league_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="Not a participant in this match")
    if match.status != models.MatchStatus.pending:
        raise HTTPException(status_code=400, detail="אי אפשר לבטל משחק שכבר דווח")

    # The ORM cascades cover the chat and the time options, but notifications
    # and rating samples aren't relationships on Match — clear them all through
    # the one place that knows about every reference.
    purge_match_references(db, [match.id])
    db.delete(match)
    db.commit()
