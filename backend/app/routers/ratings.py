from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..rating_utils import (
    apply_self_placement_check,
    band_name,
    compute_competitive_level,
    compute_questionnaire_level,
    get_rating,
    round_to_half,
)

router = APIRouter(tags=["ratings"])

# q3 option index for "College, national or professional" — picking it swaps
# the rally/serve questions for the single competitive-venue question.
COMPETITIVE_Q3_INDEX = 3


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
            models.League.is_open.is_(True),
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


def _compute_level_from_answers(answers: schemas.RatingAnswers) -> tuple[float, bool]:
    for value in (answers.q1, answers.q2, answers.q3):
        if value not in (0, 1, 2, 3):
            raise HTTPException(status_code=400, detail="תשובה לא תקינה")

    competitive = answers.q3 == COMPETITIVE_Q3_INDEX
    if competitive:
        if answers.venue not in (0, 1, 2, 3):
            raise HTTPException(status_code=400, detail="תשובה לא תקינה")
        level = compute_competitive_level(answers.venue)
    else:
        for value in (answers.q4, answers.q5):
            if value not in (0, 1, 2, 3):
                raise HTTPException(status_code=400, detail="תשובה לא תקינה")
        if answers.q6 not in (0, 1, 2, 3, 4):
            raise HTTPException(status_code=400, detail="תשובה לא תקינה")
        level = compute_questionnaire_level(answers.q1, answers.q2, answers.q3, answers.q4, answers.q5)
        level = apply_self_placement_check(level, answers.q6)
    return level, competitive


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
        schemas.PlayerRatingOut(
            sport_id=r.sport_id,
            level=round_to_half(r.level),
            provisional=r.provisional,
            rated_matches=r.matches_played,
            finalized_at=r.finalized_at,
        )
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

    level, competitive = _compute_level_from_answers(answers)

    rating = models.PlayerRating(
        user_id=current_user.id, sport_id=league.sport_id, level=level, competitive=competitive
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)

    db.add(
        models.RatingSample(
            user_id=current_user.id,
            sport_id=league.sport_id,
            match_id=None,
            level_before=rating.level,
            level_after=rating.level,
        )
    )
    db.commit()

    return _build_result(db, league, rating.level, rating.provisional, current_user.id)


@router.get("/ratings/history", response_model=schemas.RatingHistoryOut)
def rating_history(
    sport_id: int,
    months: int = 12,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """homeformandratingchart125a.md section 7.3 — one aggregated point per
    calendar month (the last sample within that month); a month with no
    matches carries forward the previous month's value so the line stays
    continuous instead of gapping."""
    rating = get_rating(db, current_user.id, sport_id)
    if not rating:
        raise HTTPException(status_code=404, detail="אין לך דירוג בענף הזה")

    samples = (
        db.query(models.RatingSample)
        .filter(models.RatingSample.user_id == current_user.id, models.RatingSample.sport_id == sport_id)
        .order_by(models.RatingSample.created_at.asc())
        .all()
    )

    monthly: list[dict] = []
    if samples:
        by_month: dict[str, float] = {}
        for s in samples:
            by_month[s.created_at.strftime("%Y-%m")] = s.level_after

        def month_index(dt: datetime) -> int:
            return dt.year * 12 + (dt.month - 1)

        now = datetime.utcnow()
        start_idx = max(month_index(samples[0].created_at), month_index(now) - (months - 1))
        end_idx = month_index(now)

        carry = samples[0].level_after
        for s in samples:
            if month_index(s.created_at) <= start_idx:
                carry = s.level_after
            else:
                break

        for idx in range(start_idx, end_idx + 1):
            y, m = divmod(idx, 12)
            key = f"{y:04d}-{m + 1:02d}"
            if key in by_month:
                carry = by_month[key]
            monthly.append({"month": key, "level": round(carry, 2)})
        monthly = monthly[-months:]

    return schemas.RatingHistoryOut(
        samples=[schemas.RatingHistorySample(month=m["month"], level=m["level"]) for m in monthly],
        current=round_to_half(rating.level),
        current_level=round(rating.level, 2),
        provisional=rating.provisional,
        matches_played=rating.matches_played,
    )


@router.post("/ratings/{sport_id}/submit", response_model=schemas.RatingRetakeOut)
def submit_rating_for_sport(
    sport_id: int,
    answers: schemas.RatingAnswers,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Initial rating submission with no league to anchor to — needed before
    creating the first league in a sport, when no league exists yet to hang
    /leagues/{league_id}/rate off of."""
    sport = db.query(models.Sport).filter(models.Sport.id == sport_id).first()
    if not sport:
        raise HTTPException(status_code=404, detail="Sport not found")
    if get_rating(db, current_user.id, sport_id):
        raise HTTPException(status_code=400, detail="כבר יש לך דירוג בענף הזה")

    level, competitive = _compute_level_from_answers(answers)

    rating = models.PlayerRating(user_id=current_user.id, sport_id=sport_id, level=level, competitive=competitive)
    db.add(rating)
    db.commit()
    db.refresh(rating)

    db.add(
        models.RatingSample(
            user_id=current_user.id,
            sport_id=sport_id,
            match_id=None,
            level_before=rating.level,
            level_after=rating.level,
        )
    )
    db.commit()

    return schemas.RatingRetakeOut(
        level=round_to_half(rating.level), band=band_name(rating.level), provisional=rating.provisional
    )


@router.post("/ratings/{sport_id}/retake", response_model=schemas.RatingRetakeOut)
def retake_rating(
    sport_id: int,
    answers: schemas.RatingAnswers,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """settings114b.md — the only place a player can redo the questionnaire.
    The existing rating stays in effect (still used for standings/matchmaking)
    right up until these new answers are computed and saved here."""
    rating = get_rating(db, current_user.id, sport_id)
    if not rating:
        raise HTTPException(status_code=404, detail="אין לך דירוג בענף הזה לתקן")

    level, competitive = _compute_level_from_answers(answers)

    rating.level = level
    rating.competitive = competitive
    rating.provisional = True
    rating.matches_played = 0
    rating.finalized_at = None
    db.commit()
    db.refresh(rating)

    return schemas.RatingRetakeOut(
        level=round_to_half(rating.level), band=band_name(rating.level), provisional=rating.provisional
    )
