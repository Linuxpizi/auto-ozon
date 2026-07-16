from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON, func, ForeignKey
from app.core.db import Base


class UploadDraft(Base):
    """商品上架草稿 — 统一管理从采集商品到 Ozon 上架的全流程。

    替代原来分散在 ScrapedProductRecord.upload_* 字段和
    PrecisionListingTask 中的上架逻辑，实现：
      draft → review → submit → tracking → active/error
    """
    __tablename__ = "upload_drafts"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)

    # ── 来源信息 ──
    source_type = Column(String(32), default="scraped", comment="scraped|copied|manual")
    source_product_id = Column(Integer, default=0, comment="关联 scraped_product_records.id")
    source_sku = Column(String(128), default="", comment="来源平台 SKU / 商品 ID")
    source_name = Column(String(512), default="", comment="来源平台商品名")
    source_url = Column(String(1024), default="", comment="来源商品链接")
    source_images = Column(JSON, default=list, comment="原始图片 URL 列表")

    # ── Ozon 分类 ──
    description_category_id = Column(Integer, default=0, comment="Ozon 分类 ID")
    type_id = Column(Integer, default=0, comment="Ozon 类型 ID")
    category_name = Column(String(256), default="", comment="分类名称（便于展示）")

    # ── 商品核心数据 ──
    offer_id = Column(String(128), default="", comment="卖家自定义唯一 SKU")
    name = Column(String(512), default="", comment="Ozon 商品标题")
    description = Column(Text, default="", comment="Ozon 商品描述 (HTML)")

    # ── 价格 ──
    price_cny = Column(Float, default=0.0, comment="原始价格 (CNY)")
    price_rub = Column(Float, default=0.0, comment="上架价格 (RUB)")
    old_price_rub = Column(Float, default=0.0, comment="原价划线价 (RUB)")
    vat = Column(String(16), default="0", comment="增值税率")

    # ── 物流尺寸 ──
    weight = Column(Integer, default=500, comment="重量 (g)")
    height = Column(Integer, default=100, comment="高 (mm)")
    depth = Column(Integer, default=100, comment="深 (mm)")
    width = Column(Integer, default=100, comment="宽 (mm)")

    # ── 图片 ──
    primary_image = Column(String(1024), default="", comment="主图 URL")
    images = Column(JSON, default=list, comment="图片 URL 列表（最多 15 张）")

    # ── 上架状态 ──
    status = Column(String(32), default="draft", index=True,
                    comment="draft|ready|submitting|submitted|processing|active|error")
    error_message = Column(Text, default="")

    # ── Ozon 跟踪 ──
    ozon_task_id = Column(Integer, default=0, comment="Ozon import task_id")
    ozon_product_id = Column(Integer, default=0, comment="Ozon 分配的 product_id")
    ozon_last_synced_at = Column(DateTime, nullable=True, comment="最后同步 Ozon 状态时间")

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
