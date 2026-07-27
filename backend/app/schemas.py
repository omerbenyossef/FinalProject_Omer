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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    name: str
    age: Optional[int] = None


class UserStats(BaseModel):
    leagues: int
    matches_played: int
    wins: int


class UserOut(BaseModel):
    id: int
    name: str
    age: Optional[int] = None
    email: EmailStr
    is_admin: bool = False

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
    is_open: bool = False


class LeagueOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    sport: SportOut
    member_count: int = 0
    created_by: int
    schedule_started_at: Optional[datetime] = None
    is_open: bool = False

    class Config:
        from_attributes = True


class MemberOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class JoinLeagueRequest(BaseModel):
    code: Optional[str] = None


class InviteCodeOut(BaseModel):
    code: str


class MatchCreate(BaseModel):
    opponent_id: int


class SetScore(BaseModel):
    player1_games: int
    player2_games: int


class MatchScoreUpdate(BaseModel):
    sets: list[SetScore]


class MatchOut(BaseModel):
    id: int
    league_id: int
    player1: MemberOut
    player2: MemberOut
    player1_score: Optional[int]
    player2_score: Optional[int]
    sets: Optional[list[SetScore]] = None
    round_number: Optional[int] = None
    status: MatchStatus
    created_at: datetime
    played_at: Optional[datetime]

    class Config:
        from_attributes = True


class NextMatchEntry(BaseModel):
    league_id: int
    league_name: str
    match: MatchOut


class StandingRow(BaseModel):
    user: MemberOut
    played: int
    wins: int
    losses: int
    points: int


class HeadToHeadMatch(BaseModel):
    id: int
    league_id: int
    league_name: str
    my_score: int
    opponent_score: int
    sets: Optional[list[SetScore]] = None
    played_at: Optional[datetime]


class HeadToHeadOut(BaseModel):
    opponent: MemberOut
    wins: int
    losses: int
    matches: list[HeadToHeadMatch]
