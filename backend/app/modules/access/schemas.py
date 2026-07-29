from pydantic import BaseModel


class PermissionResponse(BaseModel):
    id: int
    code: str
    name: str
    description: str | None = None
    module: str | None = None

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name: str
    description: str | None = None


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class RolePermissionUpdate(BaseModel):
    permission_codes: list[str]


class RoleResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    is_system: bool
    permissions: list[PermissionResponse]

    model_config = {"from_attributes": True}


class UserRoleAssignment(BaseModel):
    role_names: list[str]
    version: int
