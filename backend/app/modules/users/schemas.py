from datetime import date
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.schemas import AuditedResponse


class UserResponse(AuditedResponse):
    id: int
    email: str
    username: str
    full_name: str
    roles: list[str]
    auth_provider: str
    is_active: bool
    is_external: bool
    avatar_url: str | None = None

    @field_validator("roles", mode="before")
    @classmethod
    def _roles_to_strings(cls, v):
        if not v:
            return []
        if isinstance(v[0], str):
            return v
        return [getattr(r, "name", r) for r in v]

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: str
    roles: list[str] | None = None
    is_active: bool = True
    date_of_birth: date | None
    country: str | None
    mobile_no: str | None = None
    ext_no: str | None = None


    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v

    @field_validator("username")
    @classmethod
    def username_no_spaces(cls, v: str) -> str:
        if " " in v:
            raise ValueError("Username must not contain spaces.")
        return v


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = None
    full_name: str | None = None
    roles: list[str] | None = None
    is_active: bool | None = None
    password: str | None = None
    version: int

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v

    @field_validator("username")
    @classmethod
    def username_no_spaces(cls, v: str | None) -> str | None:
        if v is not None and " " in v:
            raise ValueError("Username must not contain spaces.")
        return v

class PasswordChange(BaseModel):
    old_password:str
    new_password:str = Field(min_length=8)


