from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from app.core.db import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ReturnOrder(Base):
    """Ozon return order — synced from POST /v3/returns/company/employer."""

    __tablename__ = "return_orders"

    id = Column(Integer, primary_key=True, index=True)
    return_id = Column(String(64), unique=True, nullable=False, comment="Ozon return ID")
    order_id = Column(Integer, default=0, comment="关联的订单 ID")
    posting_number = Column(String(64), default="", comment="发货单号")
    store_id = Column(Integer, nullable=False, comment="店铺 ID")
    store_name = Column(String(128), default="")
    sku = Column(String(128), default="")
    offer_id = Column(String(128), default="")
    product_id = Column(Integer, default=0)
    product_name = Column(String(512), default="")
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, default=0.0)
    return_price = Column(Float, default=0.0, comment="退货金额")
    return_date = Column(DateTime, nullable=True, comment="退货发起时间")
    reason = Column(String(256), default="", comment="退货原因")
    reason_message = Column(Text, default="", comment="退货原因描述")
    status = Column(String(64), default="pending", comment="退货状态")
    action = Column(String(64), default="", comment="当前可执行操作")
    image_url = Column(String(512), default="")
    currency_code = Column(String(16), default="")
    notified = Column(Integer, default=0, comment="飞书通知状态: 0=未通知 1=已通知")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
