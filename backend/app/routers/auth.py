import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import create_access_token, hash_password, verify_password, get_current_user
from ..database import get_db
from ..email_utils import send_reset_email
from .matches import _auto_confirm_overdue

router = APIRouter(prefix="/auth", tags=["auth"])

RESET_TOKEN_EXPIRE_HOURS = 1


@router.post("/register", response_model=schemas.Token)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        name=user_in.name,
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.post("/login", response_model=schemas.Token)
def login(credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=user)


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=schemas.UserOut)
def update_profile(
    payload: schemas.UpdateProfileRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.name = payload.name
    current_user.age = payload.age
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me/stats", response_model=schemas.UserStats)
def my_stats(
    sport_id: int | None = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _auto_confirm_overdue(db)
    membership_query = db.query(models.LeagueMembership).filter(
        models.LeagueMembership.user_id == current_user.id
    )
    if sport_id is not None:
        membership_query = membership_query.join(models.League).filter(
            models.League.sport_id == sport_id
        )
    leagues_count = membership_query.count()

    matches_query = db.query(models.Match).filter(
        or_(
            models.Match.player1_id == current_user.id,
            models.Match.player2_id == current_user.id,
        ),
        models.Match.status == models.MatchStatus.completed,
    )
    if sport_id is not None:
        matches_query = matches_query.outerjoin(models.League).filter(
            or_(
                models.League.sport_id == sport_id,
                models.Match.sport_id == sport_id,
            )
        )
    matches = matches_query.order_by(models.Match.played_at.desc()).all()

    wins = 0
    for match in matches:
        if match.player1_id == current_user.id and match.player1_score > match.player2_score:
            wins += 1
        elif match.player2_id == current_user.id and match.player2_score > match.player1_score:
            wins += 1
    losses = len(matches) - wins

    recent_matches = []
    for match in matches[:8]:
        i_am_player1 = match.player1_id == current_user.id
        opponent = match.player2 if i_am_player1 else match.player1
        won = (
            match.player1_score > match.player2_score
            if i_am_player1
            else match.player2_score > match.player1_score
        )
        my_sets = [
            schemas.SetScore(
                player1_games=s["player1_games"] if i_am_player1 else s["player2_games"],
                player2_games=s["player2_games"] if i_am_player1 else s["player1_games"],
            )
            for s in (match.sets or [])
        ]
        recent_matches.append(
            schemas.RecentMatchEntry(
                opponent_id=opponent.id,
                opponent_name=opponent.name,
                my_sets=my_sets,
                won=won,
                kind=match.kind,
                league_name=match.league.name if match.league_id else None,
                played_at=match.played_at,
            )
        )

    return schemas.UserStats(
        leagues=leagues_count,
        matches_played=len(matches),
        wins=wins,
        losses=losses,
        recent_matches=recent_matches,
    )


@router.post("/change-password", response_model=schemas.MessageOut)
def change_password(
    payload: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="הסיסמה הנוכחית שגויה")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()

    return schemas.MessageOut(message="הסיסמה עודכנה בהצלחה")


@router.post("/change-email", response_model=schemas.UserOut)
def change_email(
    payload: schemas.ChangeEmailRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="הסיסמה הנוכחית שגויה")

    existing = db.query(models.User).filter(models.User.email == payload.new_email).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(status_code=400, detail="האימייל הזה כבר בשימוש")

    current_user.email = payload.new_email
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/forgot-password", response_model=schemas.MessageOut)
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if user:
        user.reset_token = secrets.token_urlsafe(32)
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=RESET_TOKEN_EXPIRE_HOURS)
        db.commit()
        send_reset_email(user.email, user.reset_token)

    return schemas.MessageOut(
        message="אם קיים חשבון עם האימייל הזה, נשלח אליו מייל עם קישור לאיפוס הסיסמה"
    )


@router.post("/reset-password", response_model=schemas.MessageOut)
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(
            models.User.reset_token == payload.token,
            models.User.reset_token_expires > datetime.utcnow(),
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=400, detail="קישור האיפוס אינו תקין או שפג תוקפו")

    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return schemas.MessageOut(message="הסיסמה עודכנה בהצלחה")
