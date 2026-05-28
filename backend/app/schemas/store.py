from pydantic import BaseModel


class StoreBase(BaseModel):
    name: str
    client_id: str
    api_key: str
    status: str


class StoreCreate(StoreBase):
    pass


class StoreRead(StoreBase):
    id: int

    class Config:
        orm_mode = True
