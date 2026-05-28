from sqlalchemy import Column, Integer, String, Boolean, Float, Text
from app.core.db import Base


class Store(Base):
    __tablename__ = "stores"

    id = Column(Integer, primary_key=True, index=True)
    account_name = Column(String(128), default="")
    name = Column(String(128), nullable=False)
    client_id = Column(String(128), unique=True, nullable=False)
    api_key = Column(String(256), nullable=False)
    warehouse_id = Column(String(64), default="")
    warehouse_status = Column(String(32), default="")
    type_id = Column(String(64), default="")
    status = Column(String(32), nullable=False, default="active")
    listing_status = Column(String(32), default="")
    contract_currency = Column(String(16), default="")
    vat_rate = Column(Float, default=0.0)
    auto_ad = Column(Boolean, default=False)
    auto_archive = Column(Boolean, default=False)
    auto_delete = Column(Boolean, default=False)
    notes = Column(Text, default="")
