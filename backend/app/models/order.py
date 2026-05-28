from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text
from app.core.db import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(64), unique=True, nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    store_name = Column(String(128), default="")
    account_name = Column(String(128), default="")
    is_quality_check = Column(Boolean, default=False, nullable=False)
    gmv = Column(Float, default=0.0, nullable=False)
    status = Column(String(64), nullable=False, default="pending")
    shipment_number = Column(String(64), default="")
    sku = Column(String(128), default="")
    product_name = Column(String(256), default="")
    image_url = Column(Text, default="")
    tracking_number = Column(String(128), default="")
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, default=0.0)
    must_ship_by = Column(DateTime, nullable=True)
    express_delivery = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
