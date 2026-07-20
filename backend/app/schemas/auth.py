from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AuthCredentials(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if "@" not in email or email.startswith("@") or email.endswith("@") or "." not in email.rsplit("@", 1)[-1]:
            raise ValueError("请输入有效的邮箱地址")
        return email


class RegisterRequest(AuthCredentials):
    name: Optional[str] = Field(default=None, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() or None if value is not None else None


class UserRead(BaseModel):
    id: int
    email: str
    name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead