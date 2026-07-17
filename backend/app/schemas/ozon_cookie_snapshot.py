from datetime import datetime

from pydantic import BaseModel, Field


class OzonCookieSnapshotUpsert(BaseModel):
    client_id: str = Field(min_length=1, max_length=128)
    ozon_cookie: str = Field(min_length=1)
    sso_cookie: str = ""
    source: str = Field(default="browser-extension", max_length=32)


class OzonCookieSnapshotRead(BaseModel):
    client_id: str
    source: str
    status: str
    has_ozon_cookie: bool
    has_sso_cookie: bool
    updated_at: datetime


class OzonCookieInspection(BaseModel):
    client_id: str
    available: bool
    status: str
    has_ozon_cookie: bool
    has_sso_cookie: bool
    updated_at: datetime | None = None