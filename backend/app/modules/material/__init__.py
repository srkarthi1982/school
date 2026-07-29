from fastapi import APIRouter

from app.modules.material.router import router as material_router

router = APIRouter()
router.include_router(material_router)
