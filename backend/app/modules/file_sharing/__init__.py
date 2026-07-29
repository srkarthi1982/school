from fastapi import APIRouter

from app.modules.file_sharing.router import router as file_sharing_router

router = APIRouter()
router.include_router(file_sharing_router)
