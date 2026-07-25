from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from .models import MatchStatus


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class MessageOut(BaseModel):
    message: str


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SportOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class LeagueCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sport_id: int


class LeagueOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    sport: SportOut
    member_count: int = 0

    class Config:
        from_attributes = True


class MemberOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class MatchCreate(BaseModel):
    opponent_id: int


class MatchScoreUpdate(BaseModel):
    player1_score: int
    player2_score: int


class MatchOut(BaseModel):
    id: int
    league_id: int
    player1: MemberOut
    player2: MemberOut
    player1_score: Optional[int]
    player2_score: Optional[int]
    status: MatchStatus
    created_at: datetime
    played_at: Optional[datetime]

    class Config:
        from_attributes = True


class StandingRow(BaseModel):
    user: MemberOut
    played: int
    wins: int
    losses: int
    points: int
