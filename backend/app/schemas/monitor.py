from datetime import date
from pydantic import BaseModel
from typing import Optional


class StoreMonitorBase(BaseModel):
    store_id: int
    store_name: str
    account_name: str
    daily_remaining: int = 0
    total_remaining: int = 0
    active_listings: int = 0
    date: date


class StoreMonitorCreate(StoreMonitorBase):
    pass


class StoreMonitorUpdate(BaseModel):
    daily_remaining: Optional[int] = None
    total_remaining: Optional[int] = None
    active_listings: Optional[int] = None


class StoreMonitorRead(StoreMonitorBase):
    id: int

    model_config = {"from_attributes": True}
