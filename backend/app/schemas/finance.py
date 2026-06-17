from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class StoreFinanceBase(BaseModel):
    store_id: int
    store_name: str
    account_name: str
    balance: float = 0.0
    total_income: float = 0.0
    total_expense: float = 0.0
    pending_amount: float = 0.0


class StoreFinanceCreate(StoreFinanceBase):
    pass


class StoreFinanceUpdate(BaseModel):
    balance: Optional[float] = None
    total_income: Optional[float] = None
    total_expense: Optional[float] = None
    pending_amount: Optional[float] = None


class StoreFinanceRead(StoreFinanceBase):
    id: int
    last_sync_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
