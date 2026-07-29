from fastapi import APIRouter
from fastapi.params import Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.response import SuccessResponse, ok
from app.modules.shared.models import Country
from app.modules.shared.schemas import CountryResponse

router = APIRouter(prefix='/shared', tags=['Shared'])


@router.get("/country", response_model=SuccessResponse[list[CountryResponse]],response_model_by_alias=False)
def list_countries(db: Session = Depends(get_db), _=Depends(get_current_user)):
    result = db.execute(
        select(Country.id,Country.name).order_by(Country.name)).all()
    # result = db.execute(select(Country.id, Country.name).order_by(Country.name)).first()
    return ok(result)
    # return CountryResponse.model_validate(result)
