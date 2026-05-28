from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ListingBase(BaseModel):
    store_id: int
    store_name: str
    account_name: str
    sku: str
    product_name: str
    price: float = 0.0
    status: str = "draft"
    image_url: str = ""


class ListingCreate(BaseModel):
    store_id: int
    sku: str
    product_name: str
    price: float = 0.0
    status: str = "draft"
    image_url: str = ""


class ListingUpdate(BaseModel):
    product_name: Optional[str] = None
    price: Optional[float] = None
    status: Optional[str] = None
    image_url: Optional[str] = None
    sku: Optional[str] = None


class ListingRead(ListingBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
