"""选品中心 — 从浏览器采集的 Ozon 商品数据导入与展示"""
import json
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.crud import scraped_product as sp_crud
from app.crud import store as store_crud
from app.schemas.scraped_product import ScrapedProductCreate, ScrapedProductRead

router = APIRouter()


class ProductUpdate(BaseModel):
    """编辑选品商品"""
    title: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    old_price: Optional[float] = None
    discount: Optional[str] = None
    stock: Optional[str] = None
    description: Optional[str] = None
    source_url: Optional[str] = None
    images: Optional[List[str]] = None
    attributes: Optional[List[dict]] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    seller_name: Optional[str] = None
    seller_url: Optional[str] = None
    weight_g: Optional[int] = None
    depth_mm: Optional[int] = None
    height_mm: Optional[int] = None
    width_mm: Optional[int] = None
    supplier_sku: Optional[str] = None
    barcode: Optional[str] = None
    video_url: Optional[str] = None


class UploadRequest(BaseModel):
    """上传到店铺"""
    store_id: int
    offer_id: str = ""


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


def _apply_product_filters(q, platform=None, brand=None, keyword=None,
                          min_price=None, max_price=None,
                          min_rating=None, min_reviews=None):
    """复用的筛选逻辑:同时用于 list 和 count"""
    from app.models.scraped_product import ScrapedProductRecord

    if platform:
        q = q.filter(ScrapedProductRecord.platform == platform)
    else:
        q = q.filter(ScrapedProductRecord.platform == "ozon")
    if brand:
        q = q.filter(ScrapedProductRecord.brand == brand)
    if keyword:
        q = q.filter(ScrapedProductRecord.title.ilike(f"%{keyword}%"))
    if min_price is not None:
        q = q.filter(ScrapedProductRecord.price >= min_price)
    if max_price is not None:
        q = q.filter(ScrapedProductRecord.price <= max_price)
    if min_rating is not None:
        q = q.filter(ScrapedProductRecord.rating >= min_rating)
    if min_reviews is not None:
        q = q.filter(ScrapedProductRecord.review_count >= min_reviews)
    return q


@router.get("/products", response_model=List[ScrapedProductRead])
def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    platform: Optional[str] = Query(None, description="平台筛选 (ozon/wb)"),
    brand: Optional[str] = Query(None, description="按品牌筛选"),
    keyword: Optional[str] = Query(None, description="关键词搜索"),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    min_rating: Optional[float] = Query(None, description="最低评分"),
    min_reviews: Optional[int] = Query(None, description="最低评论数"),
    db: Session = Depends(get_db),
):
    """获取选品列表,支持多维度筛选"""
    from app.models.scraped_product import ScrapedProductRecord

    q = db.query(ScrapedProductRecord)
    q = _apply_product_filters(
        q, platform=platform, brand=brand, keyword=keyword,
        min_price=min_price, max_price=max_price,
        min_rating=min_rating, min_reviews=min_reviews,
    )
    return q.order_by(ScrapedProductRecord.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/products/count")
def count_products(
    platform: Optional[str] = Query(None),
    brand: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    min_rating: Optional[float] = Query(None),
    min_reviews: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    from app.models.scraped_product import ScrapedProductRecord
    from sqlalchemy import func

    q = db.query(func.count(ScrapedProductRecord.id))
    q = _apply_product_filters(
        q, platform=platform, brand=brand, keyword=keyword,
        min_price=min_price, max_price=max_price,
        min_rating=min_rating, min_reviews=min_reviews,
    )
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


# ── 商品 CRUD 端点 ──────────────────────────────────────────────────────

@router.get("/products/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    """获取单个选品商品详情"""
    from app.models.scraped_product import ScrapedProductRecord
    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == product_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="商品不存在")
    return record


@router.put("/products/{product_id}")
def update_product(product_id: int, body: ProductUpdate, db: Session = Depends(get_db)):
    """编辑选品商品 SKU 信息"""
    from app.models.scraped_product import ScrapedProductRecord
    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == product_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="商品不存在")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return {"success": True, "product": record}


@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """删除选品商品"""
    ok = sp_crud.delete_scraped_product(db, product_id)
    if not ok:
        raise HTTPException(status_code=404, detail="商品不存在")
    return {"success": True}


@router.post("/products/{product_id}/upload")
def upload_to_store(product_id: int, body: UploadRequest, db: Session = Depends(get_db)):
    """将选品商品上传到指定 Ozon 店铺"""
    from app.models.scraped_product import ScrapedProductRecord
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == product_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="商品不存在")

    store = db.query(Store).filter(Store.id == body.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="店铺不存在")

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)

    # 构建 Ozon import 请求参数
    item = {
        "offer_id": body.offer_id or f"AUTO-{record.source_id}",
        "name": record.title,
        "category_id": 0,
        "barcode": "",
        "dimension_unit": "mm",
        "height": 100,
        "depth": 100,
        "width": 100,
        "weight": 500,
        "weight_unit": "g",
        "images": record.images[:10] if record.images else [],
        "price": str(int(record.price * 100)) if record.price else "0",
        "vat": "0",
    }
    if record.brand:
        item["attributes"] = [
            {"complex_id": 0, "id": 85, "values": [{"value": record.brand}]},
        ]

    try:
        result = client.import_products_by_sku([item])
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@router.get("/stores")
def list_stores(db: Session = Depends(get_db)):
    """获取可用店铺列表(用于上传选择)"""
    stores = store_crud.get_stores(db, limit=100)
    return [{"id": s.id, "name": s.name, "client_id": s.client_id} for s in stores]
