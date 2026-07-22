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
    description = Column(Text, default="")
    source_url = Column(String(1024), default="")
    scraped_at = Column(DateTime, nullable=True, comment="插件采集时间")

    # ── Ozon 商品级采集元数据 ──
    record_name = Column(String(512), default="", comment="Ozonbox 采集记录名")
    selected_sku = Column(String(128), default="", comment="当前 PDP 明确选中的 SKU")
    title_ru = Column(String(512), default="", comment="Ozon 俄文标题")
    description_ru = Column(Text, default="", comment="Ozon 俄文描述")
    variant_attr_ids = Column(JSON, default=list, comment="Ozon 变体属性 ID 图谱")
    collection_status = Column(String(32), default="", comment="采集记录状态，不等同于上架状态")
    ozon_category_path_id = Column(Integer, default=0, comment="Ozon categoryId")

    # ── 新增:物理规格 ──
    # ── 多值字段 (JSON arrays) ──
    video_urls = Column(JSON, default=list, comment="视频 URL 列表")
    sku_list = Column(JSON, default=list, comment="可编辑 SKU 列表 [{sku, barcode, name, price, stock, images}]")
    variants = Column(JSON, default=list, comment="真实可售 SKU 及完整变体组合")
    spec_list = Column(JSON, default=list, comment="规格列表 [{weight_g, depth_mm, height_mm, width_mm, color, size, ...}]")
    facts = Column(JSON, default=list, comment="页面/API/BCS 采集事实 [{name, value, sourcePath}]")
    tags = Column(JSON, default=list, comment="由平台主题/风格/场景事实自动采集；允许用户修正")
    color_list = Column(JSON, default=list, comment="从事实与真实变体汇总的颜色列表")

    # ── Ozon 内部分类 ──
    ozon_category_id = Column(Integer, default=0, comment="Ozon description_category_id")
    ozon_type_id = Column(Integer, default=0, comment="Ozon type_id")
    ozon_metrics = Column(JSON, default=dict, comment="Ozon 强制采集指标 docs/采集强制要求.md")
    ozon_product_id = Column(Integer, default=0, comment="Ozon product_id (上架后获得)")

    # ── Ozon 物流事实 ──
    warehouse = Column(String(256), default="")
    warehouse_id = Column(String(128), default="")
    logistics_type = Column(String(128), default="")
    delivery_method = Column(String(128), default="")
    delivery_region = Column(String(256), default="")
    delivery_days = Column(Integer, default=0)

    # ── 上架状态 ──
    upload_status = Column(String(32), default="not_uploaded", comment="not_uploaded|pending|uploading|success|failed")
    upload_task_id = Column(String(64), default="", comment="Ozon import task ID")
    offer_id = Column(String(128), default="", comment="卖家自定义 SKU (offer_id)")

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
