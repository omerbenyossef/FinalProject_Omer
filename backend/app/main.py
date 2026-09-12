from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Enum, inspect, text

from . import models
from .database import Base, engine, SessionLocal
from .routers import (
    auth,
    friendly,
    leagues,
    matches,
    notifications,
    open_matches,
    ops,
    players,
    push,
    ratings,
    schedule,
    sports,
)

Base.metadata.create_all(bind=engine)


def add_missing_columns() -> None:
    """create_all only creates brand-new tables; existing tables never get
    columns added to models after their first deploy. Patch the gap in for
    each already-existing table so schema changes don't need a migration
    tool."""
    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing_columns:
                continue
            col_type = column.type.compile(engine.dialect)
            with engine.begin() as conn:
                conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN "{column.name}" {col_type}'))


add_missing_columns()


def backfill_league_is_open() -> None:
    """League.is_open used to be inferred from join_code IS NULL, but that
    field gets overwritten the moment anyone fetches an invite code for an
    open league (round 110's "share this code with friends" reuse of the
    existing endpoint) — silently hiding the league from open-leagues browse
    forever after. Give is_open its own persisted value, seeded once from
    the join_code state at the moment this column first appears."""
    with engine.begin() as conn:
        conn.execute(text("UPDATE leagues SET is_open = (join_code IS NULL) WHERE is_open IS NULL"))


backfill_league_is_open()


def add_missing_enum_values() -> None:
    """Postgres enum columns don't pick up new Python enum.Enum members on
    their own (SQLite has no such constraint, so this only matters in
    production) — ALTER TYPE ... ADD VALUE for anything the model defines
    that the DB type doesn't have yet."""
    if engine.dialect.name != "postgresql":
        return
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            if not isinstance(column.type, Enum):
                continue
            enum_name = column.type.name
            python_values = (
                [e.value for e in column.type.enum_class] if column.type.enum_class else column.type.enums
            )
            with engine.begin() as conn:
                existing = (
                    conn.execute(
                        text(
                            "SELECT enumlabel FROM pg_enum "
                            "JOIN pg_type ON pg_enum.enumtypid = pg_type.oid "
                            "WHERE pg_type.typname = :name"
                        ),
                        {"name": enum_name},
                    )
                    .scalars()
                    .all()
                )
                for value in python_values:
                    if value not in existing:
                        conn.execute(text(f'ALTER TYPE "{enum_name}" ADD VALUE IF NOT EXISTS \'{value}\''))


add_missing_enum_values()


def relax_matches_league_id() -> None:
    """matches.league_id was NOT NULL until friendly matches (which have no
    league) shipped; add_missing_columns() only adds new columns, it can't
    loosen an existing one, so drop the constraint by hand on Postgres. SQLite
    (local dev) recreates the whole table from the model on a fresh file, so
    nothing to do there."""
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE matches ALTER COLUMN league_id DROP NOT NULL"))


relax_matches_league_id()

DEFAULT_SPORTS = ["טניס", "פאדל", "כדורגל", "כדורסל", "כדורעף", "שחמט"]


def seed_sports() -> None:
    db = SessionLocal()
    try:
        existing = {s.name for s in db.query(models.Sport).all()}
        for name in DEFAULT_SPORTS:
            if name not in existing:
                db.add(models.Sport(name=name))
        db.commit()
    finally:
        db.close()


seed_sports()


def backfill_league_levels() -> None:
    """add_missing_columns() only adds the column; it can't set a default for
    rows that already existed, so leagues created before level ranges shipped
    would otherwise sit at NULL. Give them the full, unrestricted range."""
    db = SessionLocal()
    try:
        db.query(models.League).filter(models.League.level_min.is_(None)).update(
            {models.League.level_min: models.RATING_MIN}, synchronize_session=False
        )
        db.query(models.League).filter(models.League.level_max.is_(None)).update(
            {models.League.level_max: models.RATING_MAX}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


backfill_league_levels()


def backfill_match_kind() -> None:
    """Same gap as backfill_league_levels(): add_missing_columns() can't set
    a default for rows that already existed, so matches created before a
    non-optional column shipped have it as NULL — which fails
    MatchOut/NextMatchEntry validation on read since none of these fields are
    Optional. Backfill each to the value every pre-existing match always
    implicitly had (it was a league match, always required confirmation, and
    had no schedule-coordination step to confirm)."""
    db = SessionLocal()
    try:
        db.query(models.Match).filter(models.Match.kind.is_(None)).update(
            {models.Match.kind: models.MatchKind.league}, synchronize_session=False
        )
        db.query(models.Match).filter(models.Match.requires_confirmation.is_(None)).update(
            {models.Match.requires_confirmation: True}, synchronize_session=False
        )
        db.query(models.Match).filter(models.Match.schedule_confirmed.is_(None)).update(
            {models.Match.schedule_confirmed: False}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


backfill_match_kind()


def backfill_player_rating_competitive() -> None:
    """Same gap as backfill_league_levels(): add_missing_columns() can't set
    a default for rows that already existed, so ratings created before the
    competitive-route questionnaire path shipped would otherwise sit at NULL.
    They all came from the standard 5-question path, so False is correct."""
    db = SessionLocal()
    try:
        db.query(models.PlayerRating).filter(models.PlayerRating.competitive.is_(None)).update(
            {models.PlayerRating.competitive: False}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


backfill_player_rating_competitive()


def backfill_notification_preferences() -> None:
    """settings114b.md added notification-preference columns to User; existing
    rows predate them and would otherwise sit at NULL forever (add_missing_columns
    can't apply a default retroactively)."""
    db = SessionLocal()
    try:
        db.query(models.User).filter(models.User.notify_time_proposals.is_(None)).update(
            {models.User.notify_time_proposals: True}, synchronize_session=False
        )
        db.query(models.User).filter(models.User.notify_round_opens.is_(None)).update(
            {models.User.notify_round_opens: True}, synchronize_session=False
        )
        db.query(models.User).filter(models.User.quiet_hours_from.is_(None)).update(
            {models.User.quiet_hours_from: "22:00"}, synchronize_session=False
        )
        db.query(models.User).filter(models.User.quiet_hours_to.is_(None)).update(
            {models.User.quiet_hours_to: "08:00"}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


backfill_notification_preferences()


def backfill_rating_samples() -> None:
    """homeformandratingchart125a.md — rating_samples is a brand-new table, so
    create_all() makes it but leaves it empty; existing ratings have no history
    to reconstruct, so each gets one opening sample (current level, at the
    point it was finalized if known) as the chart's starting point."""
    db = SessionLocal()
    try:
        has_sample = {
            (s.user_id, s.sport_id)
            for s in db.query(models.RatingSample.user_id, models.RatingSample.sport_id).all()
        }
        for rating in db.query(models.PlayerRating).all():
            if (rating.user_id, rating.sport_id) in has_sample:
                continue
            db.add(
                models.RatingSample(
                    user_id=rating.user_id,
                    sport_id=rating.sport_id,
                    match_id=None,
                    level_before=rating.level,
                    level_after=rating.level,
                    created_at=rating.finalized_at or datetime.utcnow(),
                )
            )
        db.commit()
    finally:
        db.close()


backfill_rating_samples()

app = FastAPI(title="Amateur Sports League API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sports.router)
app.include_router(leagues.router)
app.include_router(matches.router)
app.include_router(players.router)
app.include_router(push.router)
app.include_router(ratings.router)
app.include_router(friendly.router)
app.include_router(open_matches.router)
app.include_router(schedule.router)
app.include_router(ops.router)
app.include_router(notifications.router)


@app.get("/health")
def health():
    return {"status": "ok"}
