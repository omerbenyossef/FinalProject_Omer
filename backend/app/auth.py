import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from . import models
from .database import get_db

_DEV_SECRET = "dev-only-secret-change-me"
SECRET_KEY = os.environ.get("LEAGUE_APP_SECRET_KEY", _DEV_SECRET)

# The secret is the only thing standing between a stranger and a token that
# says "I am user 1". On the developer's own machine a known default is a
# convenience; on the real database it means anyone who has read this file can
# sign in as anybody, so there it is a refusal to start rather than a warning
# nobody reads.
if SECRET_KEY == _DEV_SECRET and not os.environ.get("DATABASE_URL", "").startswith("sqlite"):
    if os.environ.get("DATABASE_URL"):
        raise RuntimeError(
            "LEAGUE_APP_SECRET_KEY is unset and the app is pointed at a real "
            "database. Set it to a long random string (openssl rand -hex 32) "
            "in the service's environment and deploy again."
        )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def normalize_email(email: str) -> str:
    """One spelling per address. Addresses are case-insensitive in practice,
    and treating them as case-sensitive was a privilege escalation: is_admin
    compares the user's email to ADMIN_EMAIL with both sides lowered, while
    registration only rejected an exact duplicate — so registering the admin's
    address with one letter capitalised handed out the admin screen, and with
    it every user's email address. Every lookup and every write goes through
    here now."""
    return email.strip().lower()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None or user.deleted_at is not None:
        raise credentials_exception
    return user
