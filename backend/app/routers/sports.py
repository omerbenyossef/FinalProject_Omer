from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/sports", tags=["sports"])


@router.get("/", response_model=list[schemas.SportOut])
def list_sports(db: Session = Depends(get_db)):
    from .leagues import DOUBLES_BY_DEFAULT

    return [
        schemas.SportOut(
            id=sport.id, name=sport.name, plays_in_pairs=sport.name in DOUBLES_BY_DEFAULT
        )
        for sport in db.query(models.Sport).order_by(models.Sport.name).all()
    ]
