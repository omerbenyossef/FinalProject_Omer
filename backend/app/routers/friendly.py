import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..push_utils import notify_user
from ..rating_utils import match_winner_id, update_ratings_for_match
from .matches import CONFIRMATION_WINDOW, REMIND_COOLDOWN, _auto_confirm_overdue, _to_naive_utc

router = APIRouter(prefix="/friendly", tags=["friendly"])

MAX_SETS = 3


def _match_sport_id(match: models.Match) -> int | None:
    return match.league.sport_id if match.league_id else match.sport_id


def _played_stats(db: Session, me_id: int, opponent_id: int, sport_id: int):
    matches = (
        db.query(models.Match)
        .filter(
            models.Match.status == models.MatchStatus.completed,
            or_(
                and_(models.Match.player1_id == me_id, models.Match.player2_id == opponent_id),
                and_(models.Match.player1_id == opponent_id, models.Match.player2_id == me_id),
            ),
        )
        .all()
    )
    wins = losses = 0
    last_played = None
    for m in matches:
        if _match_sport_id(m) != sport_id:
            continue
        winner_id = match_winner_id(m)
        if winner_id == me_id:
            wins += 1
        elif winner_id is not None:
            losses += 1
        if m.played_at and (last_played is None or m.played_at > last_played):
            last_played = m.played_at

    my_league_ids = {
        r[0]
        for r in db.query(models.LeagueMembership.league_id)
        .join(models.League, models.League.id == models.LeagueMembership.league_id)
        .filter(models.LeagueMembership.user_id == me_id, models.League.sport_id == sport_id)
        .all()
    }
    shared_count = 0
    if my_league_ids:
        shared_count = (
            db.query(func.count(models.LeagueMembership.id))
            .filter(
                models.LeagueMembership.user_id == opponent_id,
                models.LeagueMembership.league_id.in_(my_league_ids),
            )
            .scalar()
            or 0
        )
    return wins, losses, shared_count, last_played


@router.get("/players/search", response_model=list[schemas.FriendlyPlayerOut])
def search_players(
    sport_id: int,
    q: str = "",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = q.strip()
    if query:
        candidates = (
            db.query(models.User)
            .filter(models.User.id != current_user.id, models.User.name.ilike(f"%{query}%"))
            .order_by(models.User.name)
            .limit(20)
            .all()
        )
    else:
        matches = (
            db.query(models.Match)
            .filter(
                models.Match.status == models.MatchStatus.completed,
                or_(
                    models.Match.player1_id == current_user.id,
                    models.Match.player2_id == current_user.id,
                ),
            )
            .all()
        )
        opponent_ids = {
            (m.player2_id if m.player1_id == current_user.id else m.player1_id)
            for m in matches
            if _match_sport_id(m) == sport_id
        }
        if not opponent_ids:
            return []
        candidates = db.query(models.User).filter(models.User.id.in_(opponent_ids)).all()

    results = []
    for u in candidates:
        wins, losses, shared, last_played = _played_stats(db, current_user.id, u.id, sport_id)
        results.append(
            schemas.FriendlyPlayerOut(
                id=u.id,
                name=u.name,
                wins=wins,
                losses=losses,
                shared_leagues=shared,
                last_played_at=last_played,
            )
        )
    if not query:
        results.sort(key=lambda r: r.last_played_at or datetime.min, reverse=True)
    return results


def _get_friendly_match(db: Session, match_id: int) -> models.Match:
    match = (
        db.query(models.Match)
        .filter(models.Match.id == match_id, models.Match.kind == models.MatchKind.friendly)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


@router.post("/matches", response_model=schemas.MatchOut)
def create_friendly_invite(
    invite_in: schemas.FriendlyInviteCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if invite_in.opponent_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot invite yourself")
    opponent = db.query(models.User).filter(models.User.id == invite_in.opponent_id).first()
    if not opponent:
        raise HTTPException(status_code=404, detail="Player not found")
    sport = db.query(models.Sport).filter(models.Sport.id == invite_in.sport_id).first()
    if not sport:
        raise HTTPException(status_code=404, detail="Sport not found")

    match = models.Match(
        league_id=None,
        sport_id=invite_in.sport_id,
        kind=models.MatchKind.friendly,
        invite_status=models.FriendlyInviteStatus.pending,
        player1_id=current_user.id,
        player2_id=invite_in.opponent_id,
    )
    db.add(match)
    db.commit()
    db.refresh(match)

    notify_user(
        db,
        opponent.id,
        "הזמנה למשחק ידידותי",
        f"{current_user.name} הזמין/ה אותך למשחק ידידותי",
        "/profile",
    )
    return match


@router.post("/matches/{match_id}/accept", response_model=schemas.MatchOut)
def accept_invite(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_friendly_match(db, match_id)
    if current_user.id != match.player2_id:
        raise HTTPException(status_code=403, detail="Not the invited player")
    if match.invite_status != models.FriendlyInviteStatus.pending:
        raise HTTPException(status_code=400, detail="ההזמנה כבר טופלה")

    match.invite_status = models.FriendlyInviteStatus.accepted
    db.commit()
    db.refresh(match)

    notify_user(
        db,
        match.player1_id,
        "ההזמנה אושרה",
        f"{current_user.name} אישר/ה את ההזמנה למשחק ידידותי",
        "/profile",
    )
    return match


@router.post("/matches/{match_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_invite(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_friendly_match(db, match_id)
    if current_user.id != match.player2_id:
        raise HTTPException(status_code=403, detail="Not the invited player")
    if match.invite_status != models.FriendlyInviteStatus.pending:
        raise HTTPException(status_code=400, detail="ההזמנה כבר טופלה")

    match.invite_status = models.FriendlyInviteStatus.declined
    db.commit()


@router.post("/matches/{match_id}/remind", status_code=status.HTTP_204_NO_CONTENT)
def remind_friendly(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    match = _get_friendly_match(db, match_id)
    if current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="Not a participant in this match")
    if match.last_reminded_at is not None and datetime.utcnow() - match.last_reminded_at < REMIND_COOLDOWN:
        raise HTTPException(status_code=429, detail="כבר נשלחה תזכורת למשחק הזה לאחרונה")

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id
    if match.invite_status == models.FriendlyInviteStatus.pending:
        title, body = "תזכורת להזמנה", f"{current_user.name} מזכיר/ה לך לענות להזמנה למשחק ידידותי"
    elif match.status == models.MatchStatus.pending_confirmation:
        title, body = "תזכורת: יש תוצאה לאישור", f"{current_user.name} מזכיר/ה לך לאשר את התוצאה שדווחה"
    else:
        title, body = "תזכורת למשחק", f"{current_user.name} מזכיר/ה לך לשחק ולדווח את המשחק הידידותי שלכם"
    notify_user(db, opponent_id, title, body, "/profile")
    match.last_reminded_at = datetime.utcnow()
    db.commit()


@router.post("/matches/{match_id}/score", response_model=schemas.MatchOut)
def report_friendly_score(
    match_id: int,
    score_in: schemas.FriendlyScoreUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _auto_confirm_overdue(db)
    match = _get_friendly_match(db, match_id)
    if current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="Not a participant in this match")
    if match.invite_status != models.FriendlyInviteStatus.accepted:
        raise HTTPException(status_code=400, detail="ההזמנה עדיין לא אושרה")
    if match.status != models.MatchStatus.pending:
        raise HTTPException(status_code=400, detail="כבר יש תוצאה למשחק הזה — אפשר רק לאשר אותה או לערער עליה")
    if match.scheduled_at is None or not match.schedule_confirmed:
        raise HTTPException(status_code=400, detail="צריך לתאם ולאשר שעה למשחק לפני דיווח תוצאה")
    if datetime.utcnow() < match.scheduled_at:
        raise HTTPException(status_code=400, detail="אפשר לדווח תוצאה רק אחרי השעה שנקבעה למשחק")
    if not score_in.sets:
        raise HTTPException(status_code=400, detail="צריך לדווח לפחות סט אחד")
    if len(score_in.sets) > MAX_SETS:
        raise HTTPException(status_code=400, detail=f"אפשר לדווח עד {MAX_SETS} סטים במשחק ידידותי")

    match.sets = [s.model_dump() for s in score_in.sets]
    match.player1_score = sum(1 for s in score_in.sets if s.player1_games > s.player2_games)
    match.player2_score = sum(1 for s in score_in.sets if s.player2_games > s.player1_games)
    match.played_at = datetime.utcnow()
    match.reported_by = current_user.id
    match.requires_confirmation = score_in.require_confirmation

    opponent_id = match.player2_id if current_user.id == match.player1_id else match.player1_id

    if score_in.require_confirmation:
        match.status = models.MatchStatus.pending_confirmation
        match.confirmed_by = None
        match.confirmed_at = None
        match.auto_confirm_at = datetime.utcnow() + CONFIRMATION_WINDOW
        db.commit()
        db.refresh(match)
        notify_user(
            db,
            opponent_id,
            "יש תוצאה לאישור",
            f"{current_user.name} דיווח תוצאה למשחק הידידותי שלכם, ומחכה לאישור שלך",
            "/profile",
        )
    else:
        match.status = models.MatchStatus.completed
        match.confirmed_by = None
        match.confirmed_at = datetime.utcnow()
        match.auto_confirm_at = None
        db.commit()
        db.refresh(match)
        update_ratings_for_match(db, match)

    return match


@router.post("/invite-links", response_model=schemas.FriendlyInviteLinkOut)
def create_invite_link(
    payload: schemas.FriendlyInviteLinkCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sport = db.query(models.Sport).filter(models.Sport.id == payload.sport_id).first()
    if not sport:
        raise HTTPException(status_code=404, detail="Sport not found")

    token = secrets.token_urlsafe(16)
    link = models.FriendlyInviteLink(inviter_id=current_user.id, sport_id=payload.sport_id, token=token)
    db.add(link)
    db.commit()
    return schemas.FriendlyInviteLinkOut(token=token)


@router.post("/invite-links/{token}/redeem", response_model=schemas.MatchOut)
def redeem_invite_link(
    token: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Lock the link row before checking `used` so two redemptions racing on
    # the same one-time token can't both pass the check before either
    # commits (mirrors _join_league_core's capacity-race fix; a no-op on
    # SQLite, which serializes writes anyway, but matters on Postgres).
    link = (
        db.query(models.FriendlyInviteLink)
        .filter(models.FriendlyInviteLink.token == token)
        .with_for_update()
        .first()
    )
    if not link or link.used:
        raise HTTPException(status_code=404, detail="קישור ההזמנה לא תקין או שכבר נוצל")
    if link.inviter_id == current_user.id:
        raise HTTPException(status_code=400, detail="אי אפשר להשתמש בקישור ההזמנה של עצמך")

    match = models.Match(
        league_id=None,
        sport_id=link.sport_id,
        kind=models.MatchKind.friendly,
        invite_status=models.FriendlyInviteStatus.accepted,
        player1_id=link.inviter_id,
        player2_id=current_user.id,
    )
    db.add(match)
    link.used = True
    db.commit()
    db.refresh(match)
    link.match_id = match.id
    db.commit()

    notify_user(
        db,
        link.inviter_id,
        "ההזמנה אושרה",
        f"{current_user.name} נרשם/ה והצטרף/ה למשחק הידידותי",
        "/profile",
    )
    return match
