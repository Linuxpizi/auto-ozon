from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

class ReturnOrderBase(BaseModel):
    return_id: str
    order_id: int = 0
    posting_number: str = ""
    store_id: int
    store_name: str = ""
    sku: str = ""
    offer_id: str = ""
    product_id: int = 0
    product_name: str = ""
    quantity: int = 1
    unit_price: float = 0.0
    return_price: float = 0.0
    return_date: Optional[datetime] = None
    reason: str = ""
    reason_message: str = ""
    status: str = "pending"
    action: str = ""
    image_url: str = ""
    currency_code: str = ""
    notified: int = 0


class ReturnOrderCreate(ReturnOrderBase):
    pass


class ReturnOrderUpdate(BaseModel):
    status: Optional[str] = None
    action: Optional[str] = None
    notified: Optional[int] = None
    reason: Optional[str] = None
    reason_message: Optional[str] = None


class ReturnOrderRead(ReturnOrderBase):
    id: int
    return_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
