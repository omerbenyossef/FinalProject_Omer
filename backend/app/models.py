import enum
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
)
from sqlalchemy.orm import relationship

from .database import Base


class MatchStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    reset_token = Column(String, unique=True, index=True, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)

    memberships = relationship("LeagueMembership", back_populates="user")


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

    sport = relationship("Sport", back_populates="leagues")
    memberships = relationship("LeagueMembership", back_populates="league")
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


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    player1_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    player2_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    player1_score = Column(Integer, nullable=True)
    player2_score = Column(Integer, nullable=True)
    sets = Column(JSON, nullable=True)
    status = Column(Enum(MatchStatus), default=MatchStatus.pending, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    played_at = Column(DateTime, nullable=True)

    league = relationship("League", back_populates="matches")
    player1 = relationship("User", foreign_keys=[player1_id])
    player2 = relationship("User", foreign_keys=[player2_id])
