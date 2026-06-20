from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey
from app.core.db import Base


class StoreMonitor(Base):
    __tablename__ = "store_monitors"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    store_name = Column(String(128), nullable=False)
    daily_remaining = Column(Integer, default=0, comment="当日余量")
    total_remaining = Column(Integer, default=0, comment="总剩余")
    active_listings = Column(Integer, default=0, comment="有效刊登")
    date = Column(Date, nullable=False, comment="数据日期")
