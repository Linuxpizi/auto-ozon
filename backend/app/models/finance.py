from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from app.core.db import Base


class StoreFinance(Base):
    __tablename__ = "store_finances"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    store_name = Column(String(128), nullable=False)
    account_name = Column(String(128), nullable=False)
    balance = Column(Float, default=0.0, comment="可用余额")
    total_income = Column(Float, default=0.0, comment="总收入")
    total_expense = Column(Float, default=0.0, comment="总支出/扣款")
    pending_amount = Column(Float, default=0.0, comment="待结算金额")
    last_sync_at = Column(DateTime, default=datetime.utcnow, comment="最后同步时间")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
