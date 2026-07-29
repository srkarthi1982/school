from fastapi import APIRouter

from app.modules.course_selection_form.router import router as course_selection_form_router

router = APIRouter()
router.include_router(course_selection_form_router)
