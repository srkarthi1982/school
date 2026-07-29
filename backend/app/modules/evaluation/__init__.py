from fastapi import APIRouter

from app.modules.evaluation.router import router as evaluation_router

router = APIRouter()
router.include_router(evaluation_router)
