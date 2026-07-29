from fastapi import APIRouter

from app.modules.course_selection_currencies_certificate.router import router as course_selection_currencies_router

app_router = APIRouter()
app_router.include_router(course_selection_currencies_router)
router = app_router
