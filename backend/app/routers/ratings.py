from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..rating_utils import band_name, compute_questionnaire_level, get_rating, round_to_half

router = APIRouter(tags=["ratings"])


def _get_league_or_404(db: Session, league_id: int) -> models.League:
    league = db.query(models.League).filter(models.League.id == league_id).first()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    return league


def _other_leagues_at_level(db: Session, league: models.League, level: float, user_id: int):
    already_joined = {
        m.league_id
        for m in db.query(models.LeagueMembership).filter(models.LeagueMembership.user_id == user_id).all()
    }
    candidates = (
        db.query(models.League)
        .filter(
            models.League.sport_id == league.sport_id,
            models.League.id != league.id,
            models.League.join_code.is_(None),
            models.League.level_min <= level,
            models.League.level_max >= level,
        )
        .order_by(models.League.created_at.desc())
        .all()
    )
    candidates = [l for l in candidates if l.id not in already_joined][:3]
    return [
        schemas.LeagueLevelOption(
            id=l.id, name=l.name, level_min=l.level_min, level_max=l.level_max, open_spots=True
        )
        for l in candidates
    ]


def _build_result(db: Session, league: models.League, raw_level: float, provisional: bool, user_id: int):
    level = round_to_half(raw_level)
    in_range = league.level_min <= level <= league.level_max
    other = _other_leagues_at_level(db, league, level, user_id) if not in_range else []
    return schemas.RatingResultOut(
        level=level,
        band=band_name(level),
        provisional=provisional,
        in_range=in_range,
        league_id=league.id,
        league_name=league.name,
        league_level_min=league.level_min,
        league_level_max=league.level_max,
        other_leagues=other,
    )


@router.get("/ratings/me", response_model=list[schemas.PlayerRatingOut])
def my_ratings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ratings = db.query(models.PlayerRating).filter(models.PlayerRating.user_id == current_user.id).all()
    return [
        schemas.PlayerRatingOut(sport_id=r.sport_id, level=round_to_half(r.level), provisional=r.provisional)
        for r in ratings
    ]


@router.get("/leagues/{league_id}/rating-check", response_model=schemas.RatingCheckOut)
def rating_check(
    league_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    league = _get_league_or_404(db, league_id)
    rating = get_rating(db, current_user.id, league.sport_id)
    if not rating:
        return schemas.RatingCheckOut(has_rating=False)
    result = _build_result(db, league, rating.level, rating.provisional, current_user.id)
    return schemas.RatingCheckOut(has_rating=True, result=result)


@router.post("/leagues/{league_id}/rate", response_model=schemas.RatingResultOut)
def submit_rating(
    league_id: int,
    answers: schemas.RatingAnswers,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    league = _get_league_or_404(db, league_id)
    if get_rating(db, current_user.id, league.sport_id):
        raise HTTPException(status_code=400, detail="כבר יש לך דירוג בענף הזה")

    for value in (answers.q1, answers.q2, answers.q3, answers.q4, answers.q5):
        if value not in (0, 1, 2, 3):
            raise HTTPException(status_code=400, detail="תשובה לא תקינה")

    level = compute_questionnaire_level(answers.q1, answers.q2, answers.q3, answers.q4, answers.q5)
    rating = models.PlayerRating(user_id=current_user.id, sport_id=league.sport_id, level=level)
    db.add(rating)
    db.commit()
    db.refresh(rating)

    return _build_result(db, league, rating.level, rating.provisional, current_user.id)
