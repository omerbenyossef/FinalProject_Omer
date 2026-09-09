import enum
import os
from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Enum,
    JSON,
    UniqueConstraint,
    Float,
    Boolean,
)
from sqlalchemy.orm import relationship

from .database import Base


class MatchStatus(str, enum.Enum):
    pending = "pending"
    pending_confirmation = "pending_confirmation"
    completed = "completed"
    disputed = "disputed"


class MatchKind(str, enum.Enum):
    league = "league"
    friendly = "friendly"


class FriendlyInviteStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


RATING_MIN = 1.5
RATING_MAX = 7.0
PROVISIONAL_MATCHES = 3


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    reset_token = Column(String, unique=True, index=True, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    area = Column(String, nullable=True)
    travel_radius_km = Column(Float, nullable=True)
    notify_time_proposals = Column(Boolean, nullable=False, default=True)
    notify_round_opens = Column(Boolean, nullable=False, default=True)
    quiet_hours_from = Column(String, nullable=True, default="22:00")
    quiet_hours_to = Column(String, nullable=True, default="08:00")

    memberships = relationship("LeagueMembership", back_populates="user")
    push_subscriptions = relationship("PushSubscription", back_populates="user")

    @property
    def is_admin(self) -> bool:
        admin_email = os.environ.get("ADMIN_EMAIL", "")
        return bool(admin_email) and self.email.lower() == admin_email.lower()


class Sport(Base):
    __tablename__ = "sports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    leagues = relationship("League", back_populates="sport")


class League(Base):
    __tablename__ = "leagues"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    sport_id = Column(Integer, ForeignKey("sports.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    schedule_started_at = Column(DateTime, nullable=True)
    join_code = Column(String, nullable=True)
    is_open = Column(Boolean, nullable=True)
    best_of = Column(Integer, nullable=True, default=3)
    round_length_days = Column(Integer, nullable=True, default=7)
    level_min = Column(Float, nullable=False, default=RATING_MIN)
    level_max = Column(Float, nullable=False, default=RATING_MAX)
    capacity = Column(Integer, nullable=True)
    starts_at = Column(DateTime, nullable=True)
    location_name = Column(String, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    planned_rounds = Column(Integer, nullable=True)

    sport = relationship("Sport", back_populates="leagues")
    memberships = relationship("LeagueMembership", back_populates="league", order_by="LeagueMembership.id")
    matches = relationship("Match", back_populates="league")


class LeagueMembership(Base):
    __tablename__ = "league_memberships"
    __table_args__ = (UniqueConstraint("league_id", "user_id", name="uq_league_user"),)

    id = Column(Integer, primary_key=True, index=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    league = relationship("League", back_populates="memberships")
    user = relationship("User", back_populates="memberships")


class PlayerRating(Base):
    __tablename__ = "player_ratings"
    __table_args__ = (UniqueConstraint("user_id", "sport_id", name="uq_rating_user_sport"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sport_id = Column(Integer, ForeignKey("sports.id"), nullable=False)
    level = Column(Float, nullable=False)
    provisional = Column(Boolean, default=True, nullable=False)
    matches_played = Column(Integer, default=0, nullable=False)
    competitive = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    finalized_at = Column(DateTime, nullable=True)

    user = relationship("User")
    sport = relationship("Sport")


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=True)
    sport_id = Column(Integer, ForeignKey("sports.id"), nullable=True)
    kind = Column(Enum(MatchKind), default=MatchKind.league, nullable=False)
    invite_status = Column(Enum(FriendlyInviteStatus), nullable=True)
    requires_confirmation = Column(Boolean, default=True, nullable=False)
    scheduled_at = Column(DateTime, nullable=True)
    scheduled_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    schedule_confirmed = Column(Boolean, default=False, nullable=False)
    schedule_proposed_at = Column(DateTime, nullable=True)
    court = Column(String, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    player1_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    player2_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    player1_score = Column(Integer, nullable=True)
    player2_score = Column(Integer, nullable=True)
    sets = Column(JSON, nullable=True)
    round_number = Column(Integer, nullable=True)
    status = Column(Enum(MatchStatus), default=MatchStatus.pending, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    played_at = Column(DateTime, nullable=True)
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    auto_confirm_at = Column(DateTime, nullable=True)
    corrected_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    corrected_sets = Column(JSON, nullable=True)
    dispute_note = Column(String, nullable=True)
    disputed_at = Column(DateTime, nullable=True)
    last_reminded_at = Column(DateTime, nullable=True)
    auto_remind_count = Column(Integer, default=0, nullable=False)
    void_reason = Column(String, nullable=True)

    league = relationship("League", back_populates="matches")
    sport = relationship("Sport")
    player1 = relationship("User", foreign_keys=[player1_id])
    player2 = relationship("User", foreign_keys=[player2_id])


class RatingSample(Base):
    """homeformandratingchart125a.md — one row per rating change (plus an
    opening row from the questionnaire, match_id=None) so the home screen's
    12-month chart has something to draw. PlayerRating itself only ever
    stores the current level."""

    __tablename__ = "rating_samples"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sport_id = Column(Integer, ForeignKey("sports.id"), nullable=False, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    level_before = Column(Float, nullable=False)
    level_after = Column(Float, nullable=False)
    opponent_level = Column(Float, nullable=True)
    won = Column(Boolean, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("endpoint", name="uq_push_endpoint"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    endpoint = Column(String, nullable=False)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="push_subscriptions")


class FriendlyInviteLink(Base):
    __tablename__ = "friendly_invite_links"

    id = Column(Integer, primary_key=True, index=True)
    inviter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sport_id = Column(Integer, ForeignKey("sports.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    inviter = relationship("User")
    sport = relationship("Sport")
