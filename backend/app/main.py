from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from . import models
from .database import Base, engine, SessionLocal
from .routers import auth, leagues, matches, players, push, sports

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


@app.get("/health")
def health():
    return {"status": "ok"}
