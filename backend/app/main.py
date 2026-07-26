from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .database import Base, engine, SessionLocal
from .routers import auth, leagues, matches, sports

Base.metadata.create_all(bind=engine)

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


@app.get("/health")
def health():
    return {"status": "ok"}
