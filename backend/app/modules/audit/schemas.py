from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    table_name: str
    row_id: str
    operation: str
    user_id: int | None
    user_name: str | None = None
    timestamp: datetime
    before_data: dict | None
    after_data: dict | None
    changed_fields: list | None

    model_config = {"from_attributes": True}
