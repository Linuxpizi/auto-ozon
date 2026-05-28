from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey
from app.core.db import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(64), unique=True, nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    is_quality_check = Column(Boolean, default=False, nullable=False)
    gmv = Column(Float, default=0.0, nullable=False)
    status = Column(String(64), nullable=False, default="pending")
