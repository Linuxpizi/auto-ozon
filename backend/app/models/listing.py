from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey, func
from app.core.db import Base


class Listing(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    store_name = Column(String(128), nullable=False)
    account_name = Column(String(128), nullable=False)
    offer_id = Column(String(128), default="")
    product_id = Column(String(128), default="")
    sku = Column(String(128), default="")
    name = Column(String(512), default="")
    primary_image = Column(Text, default="")
    price = Column(String(32), default="")
    old_price = Column(String(32), default="")
    vat = Column(String(16), default="")
    has_fbo_stocks = Column(Boolean, default=False)
    has_fbs_stocks = Column(Boolean, default=False)
    archived = Column(Boolean, default=False)
    is_discounted = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
