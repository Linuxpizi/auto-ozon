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

    # ── 新增:物理规格 ──
    weight_g = Column(Integer, default=0, comment="包装重量(克)")
    depth_mm = Column(Integer, default=0, comment="包装长度(mm)")
    height_mm = Column(Integer, default=0, comment="包装高度(mm)")
    width_mm = Column(Integer, default=0, comment="包装宽度(mm)")

    # ── 新增:标识符 ──
    supplier_sku = Column(String(128), default="", comment="供应商 SKU / 货号")
    barcode = Column(String(64), default="", comment="EAN/GTIN 条形码")

    # ── 新增:媒体 ──
    video_url = Column(String(1024), default="", comment="商品视频 URL")

    # ── 新增:Ozon 内部分类(从公开参考数据 API 获取) ──
    ozon_category_id = Column(Integer, default=0, comment="Ozon description_category_id")
    ozon_type_id = Column(Integer, default=0, comment="Ozon type_id")

    synced = Column(Boolean, default=True, comment="是否已同步到后端")
    matched = Column(Boolean, default=False, comment="是否已比价匹配")
    matched_suppliers = Column(JSON, default=list, comment="匹配到的供应商信息")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
