from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey, func
from app.core.db import Base


class Listing(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    store_name = Column(String(128), nullable=False)
    account_name = Column(String(128), nullable=False)
    sku = Column(String(128), nullable=False)
    product_name = Column(String(256), nullable=False)
    price = Column(Float, default=0.0)
    status = Column(String(32), default="draft", comment="draft/published/archived")
    image_url = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
