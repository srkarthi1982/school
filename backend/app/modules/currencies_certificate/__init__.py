from fastapi import APIRouter

app_router = APIRouter()

from app.modules.currencies_certificate.router import router as currencies_router
from app.modules.currencies_certificate.flight_package_router import (
    router as flight_package_router,
    task_master_router as flight_task_master_router,
    fpa_router as flight_pack_association_router,
)
from app.modules.currencies_certificate.task_association_router import (
    router as task_association_router,
)

app_router.include_router(currencies_router)
app_router.include_router(flight_package_router)
app_router.include_router(flight_task_master_router)
app_router.include_router(flight_pack_association_router)
app_router.include_router(task_association_router)
router = app_router
