import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import create_access_token, hash_password, verify_password, get_current_user
from ..database import get_db
from ..email_utils import send_reset_email

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
