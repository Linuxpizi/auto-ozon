from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class OrderBase(BaseModel):
    order_number: str
    store_id: int
    store_name: str = ""
    account_name: str = ""
    is_quality_check: bool = False
    gmv: float = 0.0
    status: str = "pending"
    shipment_number: str = ""
    sku: str = ""
    product_name: str = ""
    image_url: str = ""
    tracking_number: str = ""
    quantity: int = 1
    unit_price: float = 0.0
    must_ship_by: Optional[datetime] = None
    express_delivery: bool = False


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    order_number: Optional[str] = None
    store_id: Optional[int] = None
    store_name: Optional[str] = None
    account_name: Optional[str] = None
    is_quality_check: Optional[bool] = None
    gmv: Optional[float] = None
    status: Optional[str] = None
    shipment_number: Optional[str] = None
    sku: Optional[str] = None
    product_name: Optional[str] = None
    image_url: Optional[str] = None
    tracking_number: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    must_ship_by: Optional[datetime] = None
    express_delivery: Optional[bool] = None


class OrderRead(OrderBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
