from fastapi import APIRouter

from app.modules.request.router import router as request_router

router = APIRouter()
router.include_router(request_router)
