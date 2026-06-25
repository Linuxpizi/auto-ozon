from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from app.core.db import Base


class PrecisionListingTask(Base):
    __tablename__ = "precision_listing_tasks"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    store_name = Column(String(128), nullable=False)

    # Source info
    mode = Column(String(32), nullable=False, default="copy_ozon", comment="copy_ozon | external")
    source_sku = Column(String(128), default="", comment="Source SKU for copy mode")
    source_name = Column(String(512), default="", comment="Original product name")
    source_description = Column(Text, default="", comment="Original description (HTML)")
    source_images = Column(Text, default="[]", comment="JSON array of source image URLs")
    source_attributes = Column(Text, default="[]", comment="JSON array of source attributes")

    # Category / type mapping
    category_id = Column(Integer, default=0, comment="Ozon description category ID")
    type_id = Column(Integer, default=0, comment="Ozon product type ID")
    category_name = Column(String(256), default="")

    # Translated content
    translated_name = Column(String(512), default="", comment="Translated title")
    translated_description = Column(Text, default="", comment="Translated description (HTML)")
    translated_attributes = Column(Text, default="[]", comment="Translated attributes JSON")

    # Pricing
    price = Column(String(32), default="", comment="Selling price in RUB")
    old_price = Column(String(32), default="", comment="Old/strikethrough price")
    vat = Column(String(16), default="0", comment="VAT rate, e.g. 0, 0.1, 0.2")

    # Dimensions
    weight = Column(Integer, default=0, comment="Weight in grams")
    depth = Column(Integer, default=0, comment="Depth in mm")
    height = Column(Integer, default=0, comment="Height in mm")
    width = Column(Integer, default=0, comment="Width in mm")

    # Result after submission
    offer_id = Column(String(128), default="", comment="New offer_id on Ozon")
    product_id = Column(String(128), default="", comment="New product_id on Ozon")
    task_id = Column(Integer, default=0, comment="Ozon async task_id from import API")

    # Status: draft | translating | ready | submitted | active | rejected | error
    status = Column(String(32), nullable=False, default="draft")
    error_message = Column(Text, default="")

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
