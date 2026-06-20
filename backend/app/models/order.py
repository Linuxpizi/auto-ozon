from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from app.core.db import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(64), unique=True, nullable=False)
    store_id = Column(Integer, nullable=False)
    store_name = Column(String(128), default="")
    is_quality_check = Column(Boolean, default=False, nullable=False)
    gmv = Column(Float, default=0.0, nullable=False)
    status = Column(String(64), nullable=False, default="pending")
    substatus = Column(String(64), default="")
    shipment_number = Column(String(64), default="")
    sku = Column(String(128), default="")
    offer_id = Column(String(128), default="")
    product_id = Column(Integer, default=0)
    product_name = Column(String(256), default="")
    products_json = Column(Text, default="[]", comment="全部商品 JSON 数组")
    image_url = Column(Text, nullable=False, default="")
    tracking_number = Column(String(128), default="")
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, default=0.0)
    customer_price = Column(Float, default=0.0)
    payout = Column(Float, default=0.0)
    commission = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    must_ship_by = Column(DateTime, nullable=True)
    in_process_at = Column(DateTime, nullable=True)
    express_delivery = Column(Boolean, default=False)
    available_actions = Column(Text, default="[]", comment="Ozon 可执行操作 JSON 数组")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
