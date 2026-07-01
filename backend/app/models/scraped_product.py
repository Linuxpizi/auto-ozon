from sqlalchemy import Column, Integer, String, Float, Text, Boolean, DateTime, JSON, func
from app.core.db import Base


class ScrapedProductRecord(Base):
    """浏览器插件采集的商品记录"""
    __tablename__ = "scraped_product_records"

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String(16), nullable=False, comment="ozon | wb | 1688")
    source_id = Column(String(64), nullable=False, comment="平台商品 ID")
    title = Column(String(512), default="")
    price = Column(Float, default=0.0, comment="当前价格")
    old_price = Column(Float, default=0.0, comment="原价")
    currency = Column(String(8), default="", comment="币种: CNY/RUB/USD")
    images = Column(JSON, default=list, comment="图片 URL 列表")
    rating = Column(Float, default=0.0)
    review_count = Column(Integer, default=0)
    brand = Column(String(128), default="")
    category = Column(String(512), default="")
    discount = Column(String(32), default="", comment="折扣文本 如 -52%")
    stock = Column(String(128), default="", comment="库存文本 如 Осталось 5 штук")
    seller_name = Column(String(256), default="")
    seller_url = Column(String(512), default="")
    attributes = Column(JSON, default=list, comment="属性列表")
    description = Column(Text, default="")
    source_url = Column(String(1024), default="")
    scraped_at = Column(DateTime, nullable=True, comment="插件采集时间")

    # ── 新增:物理规格 ──
    # ── 多值字段 (JSON arrays) ──
    video_urls = Column(JSON, default=list, comment="视频 URL 列表")
    sku_list = Column(JSON, default=list, comment="SKU+条形码列表 [{sku, barcode}]")
    spec_list = Column(JSON, default=list, comment="规格列表 [{weight_g, depth_mm, height_mm, width_mm, color, size, ...}]")

    # ── Ozon 内部分类 ──
    ozon_category_id = Column(Integer, default=0, comment="Ozon description_category_id")
    ozon_type_id = Column(Integer, default=0, comment="Ozon type_id")

    # ── 1688 专用字段 ──
    price_ranges = Column(JSON, default=list, comment="阶梯价格 [{minQty, maxQty, price}]")
    min_order_qty = Column(Integer, default=0, comment="1688 最小起订量")
    supplier_url = Column(String(512), default="", comment="1688 供应商主页 URL")
    trade_quantity = Column(Integer, default=0, comment="1688 月成交量")

    synced = Column(Boolean, default=True, comment="是否已同步到后端")
    matched = Column(Boolean, default=False, comment="是否已比价匹配")
    matched_suppliers = Column(JSON, default=list, comment="匹配到的供应商信息")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
