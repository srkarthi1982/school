from fastapi import APIRouter

from app.modules.course_info.router import router as course_info_router

router = APIRouter()
router.include_router(course_info_router)
