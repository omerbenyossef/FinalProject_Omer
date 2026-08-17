from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from .models import MatchStatus, MatchKind, FriendlyInviteStatus


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


class ChangeEmailRequest(BaseModel):
    current_password: str
    new_email: EmailStr


class UpdateProfileRequest(BaseModel):
    name: str
    age: Optional[int] = None


class SetScore(BaseModel):
    player1_games: int
    player2_games: int


class RecentMatchEntry(BaseModel):
    opponent_id: int
    opponent_name: str
    my_sets: list[SetScore]
    won: bool
    kind: MatchKind = MatchKind.league
    league_name: Optional[str] = None
    played_at: Optional[datetime] = None


class UserStats(BaseModel):
    leagues: int
    matches_played: int
    wins: int
    losses: int = 0
    recent_matches: list[RecentMatchEntry] = []


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
    best_of: Optional[int] = None
    round_length_days: Optional[int] = None
    level_min: Optional[float] = None
    level_max: Optional[float] = None


class LeagueRulesUpdate(BaseModel):
    best_of: Optional[int] = None
    round_length_days: Optional[int] = None
    level_min: Optional[float] = None
    level_max: Optional[float] = None


class MyNextMatchSummary(BaseModel):
    opponent_name: str
    round_number: Optional[int] = None


class LeagueOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    sport: SportOut
    member_count: int = 0
    created_by: int
    created_at: Optional[datetime] = None
    schedule_started_at: Optional[datetime] = None
    is_open: bool = False
    best_of: Optional[int] = None
    round_length_days: Optional[int] = None
    level_min: Optional[float] = None
    level_max: Optional[float] = None
    my_rank: Optional[int] = None
    my_members_total: Optional[int] = None
    my_wins: Optional[int] = None
    my_losses: Optional[int] = None
    my_win_rate: Optional[int] = None
    my_rank_trend: Optional[int] = None
    my_next_match: Optional[MyNextMatchSummary] = None

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


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: str


class MatchScoreUpdate(BaseModel):
    sets: list[SetScore]


class MatchOut(BaseModel):
    id: int
    league_id: Optional[int] = None
    kind: MatchKind = MatchKind.league
    invite_status: Optional[FriendlyInviteStatus] = None
    requires_confirmation: bool = True
    player1: MemberOut
    player2: MemberOut
    player1_score: Optional[int]
    player2_score: Optional[int]
    sets: Optional[list[SetScore]] = None
    round_number: Optional[int] = None
    status: MatchStatus
    created_at: datetime
    played_at: Optional[datetime]
    reported_by: Optional[int] = None
    confirmed_by: Optional[int] = None
    confirmed_at: Optional[datetime] = None
    auto_confirm_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NextMatchEntry(BaseModel):
    kind: MatchKind = MatchKind.league
    sport_id: Optional[int] = None
    league_id: Optional[int] = None
    league_name: Optional[str] = None
    schedule_started_at: Optional[datetime] = None
    best_of: int = 3
    invite_status: Optional[FriendlyInviteStatus] = None
    match: MatchOut


class FriendlyInviteCreate(BaseModel):
    opponent_id: int
    sport_id: int


class FriendlyScoreUpdate(BaseModel):
    sets: list[SetScore]
    require_confirmation: bool = True


class FriendlyPlayerOut(BaseModel):
    id: int
    name: str
    wins: int
    losses: int
    shared_leagues: int
    last_played_at: Optional[datetime] = None


class FriendlyInviteLinkCreate(BaseModel):
    sport_id: int


class FriendlyInviteLinkOut(BaseModel):
    token: str


class StandingRow(BaseModel):
    user: MemberOut
    played: int
    wins: int
    losses: int
    points: int
    rank_delta: Optional[int] = None
    level: Optional[float] = None
    provisional: Optional[bool] = None


class HeadToHeadMatch(BaseModel):
    id: int
    kind: MatchKind = MatchKind.league
    league_id: Optional[int] = None
    league_name: Optional[str] = None
    my_score: int
    opponent_score: int
    sets: Optional[list[SetScore]] = None
    played_at: Optional[datetime]


class HeadToHeadOut(BaseModel):
    opponent: MemberOut
    wins: int
    losses: int
    matches: list[HeadToHeadMatch]


class RatingAnswers(BaseModel):
    q1: int
    q2: int
    q3: int
    q4: int
    q5: int


class PlayerRatingOut(BaseModel):
    sport_id: int
    level: float
    provisional: bool

    class Config:
        from_attributes = True


class LeagueLevelOption(BaseModel):
    id: int
    name: str
    level_min: float
    level_max: float
    open_spots: bool


class RatingResultOut(BaseModel):
    level: float
    band: str
    provisional: bool
    in_range: bool
    league_id: int
    league_name: str
    league_level_min: float
    league_level_max: float
    other_leagues: list[LeagueLevelOption] = []


class RatingCheckOut(BaseModel):
    has_rating: bool
    result: Optional[RatingResultOut] = None
