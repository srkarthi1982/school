from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import PermissionCode
from app.core.response import SuccessResponse, ok
from app.modules.faq.models import Faq
from app.modules.faq.schemas import FaqCreate, FaqResponse, FaqUpdate

router = APIRouter(prefix="/faq", tags=["FAQ"])


@router.get("", response_model=SuccessResponse[list[FaqResponse]])
def list_faqs(
    q: str | None = Query(None, max_length=255),
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FAQ_READ)),
):
    stmt = select(Faq)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Faq.question.ilike(like), Faq.answer.ilike(like)))
    stmt = stmt.order_by(Faq.created_at.desc())
    return ok(list(db.execute(stmt).scalars().all()))


@router.post("", response_model=SuccessResponse[FaqResponse], status_code=status.HTTP_201_CREATED)
def create_faq(
    payload: FaqCreate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FAQ_WRITE)),
):
    faq = Faq(question=payload.question, answer=payload.answer)
    db.add(faq)
    db.commit()
    db.refresh(faq)
    return ok(faq)


@router.put("/{faq_id}", response_model=SuccessResponse[FaqResponse])
def update_faq(
    faq_id: int,
    payload: FaqUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FAQ_WRITE)),
):
    faq = db.get(Faq, faq_id)
    if faq is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
    faq.question = payload.question
    faq.answer = payload.answer
    db.commit()
    db.refresh(faq)
    return ok(faq)


@router.delete("/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_faq(
    faq_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_permission(PermissionCode.FAQ_WRITE)),
):
    faq = db.get(Faq, faq_id)
    if faq is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
    db.delete(faq)
    db.commit()
