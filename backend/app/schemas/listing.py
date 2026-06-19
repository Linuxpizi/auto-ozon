from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ListingBase(BaseModel):
    store_id: int
    store_name: str
    account_name: str
    offer_id: str = ""
    product_id: str = ""
    sku: str = ""
    name: str = ""
    primary_image: str = ""
    price: str = ""
    old_price: str = ""
    vat: str = ""
    has_fbo_stocks: bool = False
    has_fbs_stocks: bool = False
    archived: bool = False
    is_discounted: bool = False


class ListingCreate(BaseModel):
    store_id: int
    offer_id: str = ""
    product_id: str = ""
    sku: str = ""
    name: str = ""
    primary_image: str = ""
    price: str = ""
    old_price: str = ""
    vat: str = ""
    has_fbo_stocks: bool = False
    has_fbs_stocks: bool = False
    archived: bool = False
    is_discounted: bool = False


class ListingUpdate(BaseModel):
    offer_id: Optional[str] = None
    product_id: Optional[str] = None
    sku: Optional[str] = None
    name: Optional[str] = None
    primary_image: Optional[str] = None
    price: Optional[str] = None
    old_price: Optional[str] = None
    vat: Optional[str] = None
    has_fbo_stocks: Optional[bool] = None
    has_fbs_stocks: Optional[bool] = None
    archived: Optional[bool] = None
    is_discounted: Optional[bool] = None


class ListingRead(ListingBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
