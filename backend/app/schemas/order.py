from pydantic import BaseModel


class OrderBase(BaseModel):
    order_number: str
    store_id: int
    is_quality_check: bool
    gmv: float
    status: str


class OrderCreate(OrderBase):
    pass


class OrderRead(OrderBase):
    id: int

    class Config:
        orm_mode = True
