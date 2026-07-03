from typing import Optional
from pydantic import BaseModel


class FeishuConfigBase(BaseModel):
    app_id: str = ""
    app_secret: str = ""
    chat_id: str = ""
    webhook_url: str = ""
    enabled: int = 1


class FeishuConfigCreate(FeishuConfigBase):
    pass


class FeishuConfigUpdate(BaseModel):
    app_id: Optional[str] = None
    app_secret: Optional[str] = None
    chat_id: Optional[str] = None
    webhook_url: Optional[str] = None
    enabled: Optional[int] = None


class FeishuConfigRead(FeishuConfigBase):
    id: int

    model_config = {"from_attributes": True}
