from typing import Optional
from pydantic import BaseModel


class StoreSyncConfigBase(BaseModel):
    store_id: int
    sync_orders: bool = True
    sync_finance: bool = True
    sync_warehouses: bool = True


class StoreSyncConfigUpdate(BaseModel):
    sync_orders: Optional[bool] = None
    sync_finance: Optional[bool] = None
    sync_warehouses: Optional[bool] = None


class StoreSyncConfigRead(StoreSyncConfigBase):
    id: int

    model_config = {"from_attributes": True}
