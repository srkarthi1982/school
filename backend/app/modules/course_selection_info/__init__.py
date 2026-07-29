from fastapi import APIRouter

from app.modules.course_selection_info.router import router as course_selection_info_router

router = APIRouter()
router.include_router(course_selection_info_router)
