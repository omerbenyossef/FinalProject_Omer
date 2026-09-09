from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from .models import MatchStatus, MatchKind, FriendlyInviteStatus


class UserCreate(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=8)
    area: Optional[str] = None
    travel_radius_km: Optional[float] = None


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


class DeleteAccountRequest(BaseModel):
    password: str


class UpdateProfileRequest(BaseModel):
    # settings114b.md: each identity row (Name/Area/Travel radius) saves on
    # its own as soon as it's edited, so the client only ever sends the one
    # field that changed — every field here is optional, and update_profile
    # applies only whatever was actually provided.
    name: Optional[str] = None
    age: Optional[int] = None
    area: Optional[str] = None
    travel_radius_km: Optional[float] = None


class UpdateNotificationPreferencesRequest(BaseModel):
    time_proposals: Optional[bool] = None
    round_opens: Optional[bool] = None
    quiet_from: Optional[str] = None
    quiet_to: Optional[str] = None


class SetScore(BaseModel):
    player1_games: int
    player2_games: int


# A generous sanity ceiling, not a real tennis rule (the app doesn't model
# per-set formats/tiebreaks) — just enough to reject obviously-garbage input
# like a 999-game set without rejecting any real match.
MAX_GAMES_PER_SET = 30


def _validate_submitted_sets(sets: list[SetScore]) -> list[SetScore]:
    """Shared by every *input* schema that accepts reported/corrected/disputed
    set scores. Deliberately not attached to SetScore itself — that class is
    also used to read back already-stored historical matches, and a validator
    there would 500 any old row that happened to predate this check instead
    of just rejecting new bad input."""
    for s in sets:
        if s.player1_games < 0 or s.player2_games < 0:
            raise ValueError("תוצאת סט לא יכולה להיות שלילית")
        if s.player1_games == s.player2_games:
            raise ValueError("סט חייב להסתיים עם מנצח, לא בתיקו")
        if s.player1_games > MAX_GAMES_PER_SET or s.player2_games > MAX_GAMES_PER_SET:
            raise ValueError("תוצאת הסט לא סבירה")
    return sets


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
    area: Optional[str] = None
    travel_radius_km: Optional[float] = None
    notify_time_proposals: bool = True
    notify_round_opens: bool = True
    quiet_hours_from: Optional[str] = None
    quiet_hours_to: Optional[str] = None

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
    capacity: Optional[int] = None
    starts_at: Optional[datetime] = None
    location_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    planned_rounds: Optional[int] = None


class LeagueRulesUpdate(BaseModel):
    best_of: Optional[int] = None
    round_length_days: Optional[int] = None
    level_min: Optional[float] = None
    level_max: Optional[float] = None
    capacity: Optional[int] = None
    starts_at: Optional[datetime] = None
    clear_capacity: bool = False
    clear_starts_at: bool = False
    location_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    planned_rounds: Optional[int] = None
    clear_planned_rounds: bool = False


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
    capacity: Optional[int] = None
    starts_at: Optional[datetime] = None
    location_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    planned_rounds: Optional[int] = None
    my_rank: Optional[int] = None
    my_members_total: Optional[int] = None
    my_wins: Optional[int] = None
    my_losses: Optional[int] = None
    my_win_rate: Optional[int] = None
    my_rank_trend: Optional[int] = None
    my_next_match: Optional[MyNextMatchSummary] = None

    class Config:
        from_attributes = True


class OpenLeagueOut(BaseModel):
    id: int
    name: str
    location_name: Optional[str] = None
    distance_km: Optional[float] = None
    rounds: Optional[int] = None
    round_length_days: int = 7
    level_min: float
    level_max: float
    joined: int
    capacity: Optional[int] = None
    starts_at: Optional[datetime] = None
    is_full: bool = False
    best_fit: bool = False


class LeaguePreviewOut(BaseModel):
    id: int
    name: str
    sport_id: int
    sport_name: str
    location_name: Optional[str] = None
    distance_km: Optional[float] = None
    starts_at: Optional[datetime] = None
    rounds: Optional[int] = None
    round_length_days: int = 7
    best_of: int = 3
    joined: int
    capacity: Optional[int] = None
    level_min: float
    level_max: float
    level_histogram: list[int]
    my_level: Optional[float] = None
    my_bucket_index: Optional[int] = None
    is_member: bool = False


class JoinByCodeRequest(BaseModel):
    code: str


class LeagueCodeLookupOut(BaseModel):
    id: int


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

    @field_validator("sets")
    @classmethod
    def _validate_sets(cls, sets: list[SetScore]) -> list[SetScore]:
        return _validate_submitted_sets(sets)


class MatchCorrection(BaseModel):
    sets: list[SetScore]
    note: Optional[str] = None

    @field_validator("sets")
    @classmethod
    def _validate_sets(cls, sets: list[SetScore]) -> list[SetScore]:
        return _validate_submitted_sets(sets)


class MatchScheduleProposal(BaseModel):
    scheduled_at: datetime
    court: Optional[str] = None
    duration_minutes: Optional[int] = None
    override_conflict_warning: bool = False


class ScheduleConfirmRequest(BaseModel):
    override_conflict_warning: bool = False


class MatchOut(BaseModel):
    id: int
    league_id: Optional[int] = None
    kind: MatchKind = MatchKind.league
    invite_status: Optional[FriendlyInviteStatus] = None
    requires_confirmation: bool = True
    scheduled_at: Optional[datetime] = None
    scheduled_by: Optional[int] = None
    schedule_confirmed: bool = False
    court: Optional[str] = None
    duration_minutes: Optional[int] = None
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
    corrected_by: Optional[int] = None
    corrected_sets: Optional[list[SetScore]] = None
    dispute_note: Optional[str] = None
    disputed_at: Optional[datetime] = None
    void_reason: Optional[str] = None

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


class OpenItemOut(BaseModel):
    """One row for needsyou112a.md's "what needs you" screen — see
    routers/leagues.py list_open_items for how `type` is decided and how
    old_rank/new_rank (the "confirming this drops/moves you #X -> #Y"
    context) are computed."""

    type: str  # "confirm" | "report" | "proposed" | "waiting"
    kind: MatchKind = MatchKind.league
    sport_id: Optional[int] = None
    league_id: Optional[int] = None
    league_name: Optional[str] = None
    schedule_started_at: Optional[datetime] = None
    round_length_days: int = 7
    best_of: int = 3
    old_rank: Optional[int] = None
    new_rank: Optional[int] = None
    members_total: Optional[int] = None
    match: MatchOut


class OpenItemsOut(BaseModel):
    items: list[OpenItemOut]
    scheduled_count: int = 0


class FriendlyInviteCreate(BaseModel):
    opponent_id: int
    sport_id: int


class FriendlyScoreUpdate(BaseModel):
    sets: list[SetScore]
    require_confirmation: bool = True

    @field_validator("sets")
    @classmethod
    def _validate_sets(cls, sets: list[SetScore]) -> list[SetScore]:
        return _validate_submitted_sets(sets)


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
    round_number: Optional[int] = None
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
    # Standard path (q3 != competitive option): q4 + q5 + q6 required, venue unused.
    # Competitive path (q3 == competitive option): venue required, q4/q5/q6 unused.
    q4: Optional[int] = None
    q5: Optional[int] = None
    q6: Optional[int] = None
    venue: Optional[int] = None


class PlayerRatingOut(BaseModel):
    sport_id: int
    level: float
    provisional: bool
    rated_matches: int
    finalized_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RatingRetakeOut(BaseModel):
    level: float
    band: str
    provisional: bool


class RatingHistorySample(BaseModel):
    month: str
    level: float


class RatingHistoryOut(BaseModel):
    samples: list[RatingHistorySample]
    current: float
    current_level: float
    provisional: bool
    matches_played: int


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


class RankingsPlayerOut(BaseModel):
    id: int
    rank: int
    display_name: str
    ntrp: float
    wins: int
    losses: int
    win_pct: int


class RankingsMeOut(BaseModel):
    rank: Optional[int] = None
    display_name: str
    ntrp: Optional[float] = None
    wins: int
    losses: int
    win_pct: int = 0
    matches_played: int


class RankingsOut(BaseModel):
    total: int
    me: RankingsMeOut
    players: list[RankingsPlayerOut]
    next_cursor: Optional[str] = None
    min_matches: int


class SharedLeagueOut(BaseModel):
    id: int
    name: str
    my_rank: Optional[int] = None
    opponent_rank: Optional[int] = None
    member_count: int


class PlayerProfileOut(BaseModel):
    id: int
    name: str
    joined_at: datetime
    league_count: int
    ntrp: Optional[float] = None
    rank: Optional[int] = None
    total_players: int
    wins: int
    losses: int
    streak: int
    streak_won: Optional[bool] = None
    shared_leagues: list[SharedLeagueOut] = []


class ResultPrediction(BaseModel):
    my_wins_before: int
    my_losses_before: int
    my_wins_after: int
    my_losses_after: int
    my_rank_before: Optional[int] = None
    my_rank_after: Optional[int] = None
    my_points_before: int = 0
    my_points_after: int = 0
    h2h_wins_before: int = 0
    h2h_losses_before: int = 0
    h2h_wins_after: int = 0
    h2h_losses_after: int = 0


class MatchDetailOut(BaseModel):
    id: int
    kind: MatchKind
    opponent: MemberOut
    league_id: Optional[int] = None
    league_name: Optional[str] = None
    round_number: Optional[int] = None
    schedule_started_at: Optional[datetime] = None
    round_length_days: Optional[int] = None
    status: str
    scheduled_at: Optional[datetime] = None
    scheduled_by: Optional[int] = None
    schedule_proposed_at: Optional[datetime] = None
    court: Optional[str] = None
    default_court: Optional[str] = None
    duration_minutes: Optional[int] = None
    max_sets: int = 3
    my_ntrp: Optional[float] = None
    opponent_ntrp: Optional[float] = None
    h2h_wins: int = 0
    h2h_losses: int = 0
    last_match_sets: Optional[list[SetScore]] = None
    result_status: Optional[str] = None
    reported_by: Optional[int] = None
    reported_sets: Optional[list[SetScore]] = None
    corrected_by: Optional[int] = None
    corrected_sets: Optional[list[SetScore]] = None
    dispute_note: Optional[str] = None
    disputed_at: Optional[datetime] = None
    void_reason: Optional[str] = None
    auto_confirm_at: Optional[datetime] = None
    prediction: Optional[ResultPrediction] = None


class OpsFlaggedLeague(BaseModel):
    league_id: int
    league_name: str
    flag: str  # stalled | never_started | voided
    round_number: Optional[int] = None
    round_length_days: Optional[int] = None
    schedule_started_at: Optional[datetime] = None
    created_at: datetime
    member_count: int
    capacity: Optional[int] = None
    round_matches_total: int = 0
    round_matches_played: int = 0
    league_matches_total: int = 0
    voided_count: int = 0
    same_pair_voided: bool = False


class OpsHealthyLeague(BaseModel):
    league_id: int
    league_name: str
    round_number: Optional[int] = None
    round_length_days: Optional[int] = None
    schedule_started_at: Optional[datetime] = None
    created_at: datetime
    member_count: int
    matches_total: int = 0
    matches_played: int = 0


class OpsOverviewOut(BaseModel):
    range: str
    leagues_count: int
    players_count: int
    matches_count: int
    voided_count: int
    flagged: list[OpsFlaggedLeague]
    healthy: list[OpsHealthyLeague]
