from sqlalchemy import Column, Integer, Boolean, ForeignKey
from app.core.db import Base


class StoreSyncConfig(Base):
    """Per-store sync settings — controls which data types are synced."""

    __tablename__ = "store_sync_configs"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), unique=True, nullable=False)
    sync_orders = Column(Boolean, default=True, comment="是否同步订单")
    sync_finance = Column(Boolean, default=True, comment="是否同步流水")
    sync_warehouses = Column(Boolean, default=True, comment="是否同步仓库")
