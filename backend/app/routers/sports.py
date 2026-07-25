from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/sports", tags=["sports"])


@router.get("/", response_model=list[schemas.SportOut])
def list_sports(db: Session = Depends(get_db)):
    return db.query(models.Sport).order_by(models.Sport.name).all()
