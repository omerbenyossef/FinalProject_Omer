from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Enum, inspect, text

from . import models
from .database import Base, engine, SessionLocal
from .routers import auth, friendly, leagues, matches, players, push, ratings, sports

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
    a default for rows that already existed, so matches created before the
    friendly-match feature shipped have kind/requires_confirmation as NULL —
    which fails MatchOut/NextMatchEntry validation on read since neither
    field is optional. Backfill them to the values every pre-existing match
    always implicitly had (it was a league match, and always required
    confirmation)."""
    db = SessionLocal()
    try:
        db.query(models.Match).filter(models.Match.kind.is_(None)).update(
            {models.Match.kind: models.MatchKind.league}, synchronize_session=False
        )
        db.query(models.Match).filter(models.Match.requires_confirmation.is_(None)).update(
            {models.Match.requires_confirmation: True}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


backfill_match_kind()

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


@app.get("/health")
def health():
    return {"status": "ok"}
