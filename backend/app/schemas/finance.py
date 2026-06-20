from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class StoreFinanceBase(BaseModel):
    store_id: int
    store_name: str
    currency_code: str = "RUB"
    opening_balance: float = 0.0
    balance: float = 0.0
    total_income: float = 0.0
    sales_fee: float = 0.0
    sales_revenue: float = 0.0
    sales_partner: float = 0.0
    returns_amount: float = 0.0
    returns_fee: float = 0.0
    returns_revenue: float = 0.0
    returns_partner: float = 0.0
    services_cost: float = 0.0
    services_detail: str = "[]"
    total_expense: float = 0.0
    pending_amount: float = 0.0
    paid: float = 0.0


class StoreFinanceCreate(StoreFinanceBase):
    pass


class StoreFinanceUpdate(BaseModel):
    currency_code: Optional[str] = None
    opening_balance: Optional[float] = None
    balance: Optional[float] = None
    total_income: Optional[float] = None
    sales_fee: Optional[float] = None
    sales_revenue: Optional[float] = None
    sales_partner: Optional[float] = None
    returns_amount: Optional[float] = None
    returns_fee: Optional[float] = None
    returns_revenue: Optional[float] = None
    returns_partner: Optional[float] = None
    services_cost: Optional[float] = None
    services_detail: Optional[str] = None
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
    store_id: int = 0
    period_id: int = 0
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
