from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class OrderBase(BaseModel):
    order_number: str
    store_id: int
    store_name: str = ""
    is_quality_check: bool = False
    gmv: float = 0.0
    status: str = "pending"
    substatus: str = ""
    shipment_number: str = ""
    sku: str = ""
    offer_id: str = ""
    product_id: int = 0
    product_name: str = ""
    products_json: str = "[]"
    image_url: str = ""
    tracking_number: str = ""
    quantity: int = 1
    unit_price: float = 0.0
    customer_price: float = 0.0
    payout: float = 0.0
    commission: float = 0.0
    discount: float = 0.0
    must_ship_by: Optional[datetime] = None
    in_process_at: Optional[datetime] = None
    express_delivery: bool = False
    available_actions: str = "[]"


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    order_number: Optional[str] = None
    store_id: Optional[int] = None
    store_name: Optional[str] = None
    is_quality_check: Optional[bool] = None
    gmv: Optional[float] = None
    status: Optional[str] = None
    substatus: Optional[str] = None
    shipment_number: Optional[str] = None
    sku: Optional[str] = None
    offer_id: Optional[str] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    products_json: Optional[str] = None
    image_url: Optional[str] = None
    tracking_number: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    customer_price: Optional[float] = None
    payout: Optional[float] = None
    commission: Optional[float] = None
    discount: Optional[float] = None
    must_ship_by: Optional[datetime] = None
    in_process_at: Optional[datetime] = None
    express_delivery: Optional[bool] = None
    available_actions: Optional[str] = None


class OrderRead(OrderBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
