from fastapi import APIRouter

from app.modules.course_session_schedule.router import router as course_session_schedule_router

router = APIRouter()
router.include_router(course_session_schedule_router)
