from fastapi import APIRouter

from app.modules.course_selection_evaluation.router import (
    router as course_selection_evaluation_router,
)

router = APIRouter()
router.include_router(course_selection_evaluation_router)
