from fastapi import APIRouter

from app.modules.chat.admin import router as admin_router
from app.modules.chat.common import router as common_router
from app.modules.chat.student import router as student_router
from app.modules.chat.teacher import router as teacher_router

router = APIRouter()

router.include_router(common_router)
router.include_router(admin_router)
router.include_router(student_router)
router.include_router(teacher_router)


def import_chat_models():
    from app.modules.chat.admin import models
    from app.modules.chat.common import models  
    from app.modules.chat.student import models  
    from app.modules.chat.teacher import models  
