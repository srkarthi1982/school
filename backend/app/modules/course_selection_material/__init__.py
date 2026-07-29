from fastapi import APIRouter

from app.modules.course_selection_material.router import router as course_selection_material_router

router = APIRouter()
router.include_router(course_selection_material_router)
