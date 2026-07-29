from sqlalchemy import Boolean, Column, DateTime, Index, Integer, JSON, String, func

from app.core.db import Base
from app.ozon_constants import OZON_CATEGORY_LANGUAGE


class OzonCategory(Base):
    """Locally persisted snapshot of the Ozon description category tree."""

    __tablename__ = "ozon_categories"

    id = Column(Integer, primary_key=True, index=True)
    node_key = Column(String(160), nullable=False)
    language = Column(String(16), nullable=False, default=OZON_CATEGORY_LANGUAGE)
    description_category_id = Column(Integer, nullable=False, index=True)
    type_id = Column(Integer, nullable=True, index=True)
    parent_node_key = Column(String(160), nullable=True, index=True)
    name = Column(String(512), nullable=False, default="")
    path = Column(String(2048), nullable=False, default="")
    level = Column(Integer, nullable=False, default=0)
    sort_order = Column(Integer, nullable=False, default=0)
    is_leaf = Column(Boolean, nullable=False, default=False)
    raw_payload = Column(JSON, nullable=False, default=dict)
    source_store_id = Column(Integer, nullable=True)
    synced_at = Column(DateTime, nullable=False, server_default=func.now())
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("uq_ozon_categories_language_node_key", "language", "node_key", unique=True),
        Index("ix_ozon_categories_language_parent", "language", "parent_node_key"),
    )