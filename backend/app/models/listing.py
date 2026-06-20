from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey, func
from app.core.db import Base


class Listing(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    store_name = Column(String(128), nullable=False)
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
    # --- fields enriched from /v3/product/info/list ---
    barcodes = Column(Text, default="[]", comment="JSON array of barcodes")
    description = Column(Text, default="", comment="Product description (HTML)")
    images = Column(Text, default="[]", comment="JSON array of all image URLs")
    min_price = Column(String(32), default="", comment="Minimum allowed price")
    status = Column(String(32), default="", comment="Product status: active, disabled, etc.")
    type_id = Column(Integer, default=0, comment="Ozon product type ID")
    category_id = Column(Integer, default=0, comment="Description category ID")
    volume_weight = Column(Float, default=0.0, comment="Volume weight")
    currency_code = Column(String(16), default="", comment="Currency code, e.g. RUB")
    is_kgt = Column(Boolean, default=False, comment="Is oversized (KGT)")
    is_prepayment_allowed = Column(Boolean, default=False, comment="Prepayment allowed")
    commissions_json = Column(Text, default="[]", comment="JSON array of commission entries")
    stock_present = Column(Integer, default=0, comment="Total present stock count")
    stock_reserved = Column(Integer, default=0, comment="Total reserved stock count")
    ozon_created_at = Column(String(64), default="", comment="Product creation time on Ozon")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
