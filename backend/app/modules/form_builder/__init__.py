from fastapi import APIRouter

from app.modules.form_builder.router import router as form_builder_router

router = APIRouter()
router.include_router(form_builder_router)
