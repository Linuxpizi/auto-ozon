from sqlalchemy import Column, Integer, String, Float, Text, Boolean, DateTime, JSON, func
from app.core.db import Base


class ScrapedProductRecord(Base):
    """浏览器插件采集的商品记录"""
    __tablename__ = "scraped_product_records"

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String(16), nullable=False, comment="ozon | wb")
    source_id = Column(String(64), nullable=False, comment="平台商品 ID")
    title = Column(String(512), default="")
    price = Column(Float, default=0.0, comment="当前价格 (RUB)")
    old_price = Column(Float, default=0.0, comment="原价")
    images = Column(JSON, default=list, comment="图片 URL 列表")
    rating = Column(Float, default=0.0)
    review_count = Column(Integer, default=0)
    brand = Column(String(128), default="")
    category = Column(String(512), default="")
    seller_name = Column(String(256), default="")
    seller_url = Column(String(512), default="")
    attributes = Column(JSON, default=list, comment="属性列表")
    description = Column(Text, default="")
    source_url = Column(String(1024), default="")
    scraped_at = Column(DateTime, nullable=True, comment="插件采集时间")
    synced = Column(Boolean, default=True, comment="是否已同步到后端")
    matched = Column(Boolean, default=False, comment="是否已比价匹配")
    matched_suppliers = Column(JSON, default=list, comment="匹配到的供应商信息")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
