from typing import Optional
from pydantic import BaseModel


class StoreBase(BaseModel):
    name: str
    client_id: str
    api_key: str
    warehouse_id: str = ""
    warehouse_status: str = ""
    type_id: str = ""
    status: str = "active"
    listing_status: str = ""
    contract_currency: str = ""
    vat_rate: float = 0.0
    auto_ad: bool = False
    auto_archive: bool = False
    auto_delete: bool = False
    notes: str = ""
    seller_rating: str = ""
    fbs_error_index: str = ""


class StoreCreate(StoreBase):
    pass


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    client_id: Optional[str] = None
    api_key: Optional[str] = None
    warehouse_id: Optional[str] = None
    warehouse_status: Optional[str] = None
    type_id: Optional[str] = None
    status: Optional[str] = None
    listing_status: Optional[str] = None
    contract_currency: Optional[str] = None
    vat_rate: Optional[float] = None
    auto_ad: Optional[bool] = None
    auto_archive: Optional[bool] = None
    auto_delete: Optional[bool] = None
    notes: Optional[str] = None
    seller_rating: Optional[str] = None
    fbs_error_index: Optional[str] = None


class StoreRead(StoreBase):
    id: int

    model_config = {"from_attributes": True}
