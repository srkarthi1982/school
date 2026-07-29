from fastapi import APIRouter

from app.modules.it_support.router import router as tickets_router
from app.modules.it_support.router import staff_router

router = APIRouter()
router.include_router(tickets_router)
router.include_router(staff_router)

__all__ = ["router"]
