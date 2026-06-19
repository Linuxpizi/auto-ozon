from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class StoreFinanceBase(BaseModel):
    store_id: int
    store_name: str
    opening_balance: float = 0.0
    balance: float = 0.0
    total_income: float = 0.0
    total_expense: float = 0.0
    pending_amount: float = 0.0
    paid: float = 0.0


class StoreFinanceCreate(StoreFinanceBase):
    pass


class StoreFinanceUpdate(BaseModel):
    opening_balance: Optional[float] = None
    balance: Optional[float] = None
    total_income: Optional[float] = None
    total_expense: Optional[float] = None
    pending_amount: Optional[float] = None
    paid: Optional[float] = None


class StoreFinanceRead(StoreFinanceBase):
    id: int
    last_sync_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FinanceCashFlowBase(BaseModel):
    store_id: int
    store_name: str
    period_id: int
    period_begin: str = ""
    period_end: str = ""
    orders_amount: float = 0.0
    returns_amount: float = 0.0
    commission_amount: float = 0.0
    services_amount: float = 0.0
    delivery_amount: float = 0.0
    currency_code: str = "RUB"


class FinanceCashFlowRead(FinanceCashFlowBase):
    id: int
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
