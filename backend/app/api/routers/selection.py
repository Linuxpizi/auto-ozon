"""选品中心 — 从浏览器采集的 Ozon 商品数据导入与展示"""
import json
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.crud import scraped_product as sp_crud
from app.schemas.scraped_product import ScrapedProductCreate, ScrapedProductRead

router = APIRouter()


# ── request / response models ──────────────────────────────────────────
class ScrapeItem(BaseModel):
    skuId: str
    name: str = ""
    brand: str = ""
    price: str = ""
    oldPrice: str = ""
    discount: str = ""
    rating: str = ""
    reviews: str = ""
    stock: str = ""
    url: str = ""
    attributes: list[dict] = []
    skuVariants: list[dict] = []


class ImportRequest(BaseModel):
    category: str = "Смартфоны"
    category_id: int = 0
    products: list[ScrapeItem]


def _parse_price(price_str: str) -> float:
    """解析 '22 562 ₽' 之类的字符串为浮点数"""
    try:
        cleaned = price_str.replace("₽", "").replace("\xa0", "").replace(" ", "").strip()
        return float(cleaned) if cleaned else 0.0
    except (ValueError, TypeError):
        return 0.0


def _parse_rating(rating_str: str) -> float:
    try:
        return float(rating_str) if rating_str else 0.0
    except (ValueError, TypeError):
        return 0.0


def _parse_review_count(reviews_str: str) -> int:
    """解析 '1 234 отзыва' → 1234"""
    try:
        num = reviews_str.replace("отзыв", "").replace("а", "").replace("ов", "").strip()
        return int(num.replace(" ", "")) if num else 0
    except (ValueError, TypeError):
        return 0


# ── 端点 ──────────────────────────────────────────────────────────────
@router.post("/import")
def import_products(body: ImportRequest, db: Session = Depends(get_db)):
    """将浏览器抓取的商品数据导入后端数据库"""
    created = 0
    skipped = 0
    for item in body.products:
        product = ScrapedProductCreate(
            platform="ozon",
            source_id=item.skuId,
            title=item.name,
            price=_parse_price(item.price),
            old_price=_parse_price(item.oldPrice),
            images=[],
            rating=_parse_rating(item.rating),
            review_count=_parse_review_count(item.reviews),
            brand=item.brand,
            category=body.category,
            seller_name="",
            seller_url=item.url,
            attributes=item.attributes,
            description=item.stock,
            source_url=item.url,
        )
        # check duplicate
        from app.models.scraped_product import ScrapedProductRecord
        exists = (
            db.query(ScrapedProductRecord)
            .filter(
                ScrapedProductRecord.platform == "ozon",
                ScrapedProductRecord.source_id == item.skuId,
            )
            .first()
        )
        if exists:
            skipped += 1
            continue
        sp_crud.create_scraped_product(db, product)
        created += 1

    return {"success": True, "created": created, "skipped": skipped, "total": len(body.products)}


@router.post("/import-json")
def import_from_json(db: Session = Depends(get_db)):
    """从项目根目录 ozon_smartphones.json 导入数据"""
    json_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "ozon_smartphones.json")
    json_path = os.path.normpath(json_path)

    if not os.path.exists(json_path):
        raise HTTPException(status_code=404, detail=f"JSON 文件未找到: {json_path}")

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    products = [ScrapeItem(**p) for p in data.get("products", [])]
    body = ImportRequest(
        category=data.get("category", "Смартфоны"),
        category_id=data.get("category_id", 0),
        products=products,
    )
    return import_products(body, db)


@router.get("/products", response_model=List[ScrapedProductRead])
def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    brand: Optional[str] = Query(None, description="按品牌筛选"),
    keyword: Optional[str] = Query(None, description="关键词搜索"),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    db: Session = Depends(get_db),
):
    """获取选品列表,支持品牌/关键词/价格区间筛选"""
    from app.models.scraped_product import ScrapedProductRecord

    q = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.platform == "ozon")
    if brand:
        q = q.filter(ScrapedProductRecord.brand == brand)
    if keyword:
        q = q.filter(ScrapedProductRecord.title.ilike(f"%{keyword}%"))
    if min_price is not None:
        q = q.filter(ScrapedProductRecord.price >= min_price)
    if max_price is not None:
        q = q.filter(ScrapedProductRecord.price <= max_price)

    return q.order_by(ScrapedProductRecord.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/products/count")
def count_products(
    brand: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    db: Session = Depends(get_db),
):
    from app.models.scraped_product import ScrapedProductRecord
    from sqlalchemy import func

    q = db.query(func.count(ScrapedProductRecord.id)).filter(
        ScrapedProductRecord.platform == "ozon"
    )
    if brand:
        q = q.filter(ScrapedProductRecord.brand == brand)
    if keyword:
        q = q.filter(ScrapedProductRecord.title.ilike(f"%{keyword}%"))
    if min_price is not None:
        q = q.filter(ScrapedProductRecord.price >= min_price)
    if max_price is not None:
        q = q.filter(ScrapedProductRecord.price <= max_price)

    return {"total": q.scalar() or 0}


@router.get("/brands")
def list_brands(db: Session = Depends(get_db)):
    """获取所有品牌列表(用于筛选下拉)"""
    from app.models.scraped_product import ScrapedProductRecord
    from sqlalchemy import func

    rows = (
        db.query(ScrapedProductRecord.brand, func.count(ScrapedProductRecord.id))
        .filter(ScrapedProductRecord.platform == "ozon", ScrapedProductRecord.brand != "")
        .group_by(ScrapedProductRecord.brand)
        .order_by(func.count(ScrapedProductRecord.id).desc())
        .all()
    )
    return [{"brand": brand, "count": count} for brand, count in rows]
