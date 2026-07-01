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
    description_category_id: int = 0
    type_id: int = 0
    attributes: List[dict] = []
    price_rub: Optional[float] = None
    old_price_rub: Optional[float] = None
    weight_g: Optional[int] = None
    height_mm: Optional[int] = None
    depth_mm: Optional[int] = None
    width_mm: Optional[int] = None
    barcode: str = ""
    description: str = ""


class BatchUploadRequest(BaseModel):
    """批量上传到店铺"""
    product_ids: List[int]
    store_id: int
    description_category_id: int
    type_id: int
    attributes: List[dict] = []
    price_rub: Optional[float] = None
    old_price_rub: Optional[float] = None
    weight_g: Optional[int] = None
    height_mm: Optional[int] = None
    depth_mm: Optional[int] = None
    width_mm: Optional[int] = None


class CategoryTreeRequest(BaseModel):
    """查询 Ozon 分类树"""
    category_id: int = 0
    language: str = "DEFAULT"


class CategoryAttributeRequest(BaseModel):
    """查询分类属性"""
    description_category_id: int
    type_id: int = 0
    language: str = "DEFAULT"


class PriceCalcRequest(BaseModel):
    """价格换算"""
    price_cny: float
    exchange_rate: float = 12.5
    markup_factor: float = 1.5
    commission_pct: float = 10.0
    logistics_rub: float = 0.0
    packaging_rub: float = 0.0


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
        .filter(ScrapedProductRecord.brand != "")
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


class BatchDeleteRequest(BaseModel):
    ids: List[int]


@router.post("/products/batch-delete")
def batch_delete_products(body: BatchDeleteRequest, db: Session = Depends(get_db)):
    """批量删除选品商品"""
    deleted = sp_crud.bulk_delete_scraped_products(db, body.ids)
    return {"success": True, "deleted": deleted}


@router.post("/products/{product_id}/upload")
def upload_to_store(product_id: int, body: UploadRequest, db: Session = Depends(get_db)):
    """将选品商品上传到指定 Ozon 店铺（完整版）

    前端需要先：
    1. 调用 GET /selection/ozon-categories 获取分类树
    2. 用户选择分类后，调用 GET /selection/ozon-attributes 获取必填属性
    3. 用户填写/确认属性后，调用此接口提交上架
    """
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

    # 构建 Ozon import payload
    offer_id = body.offer_id or f"AUTO-{record.source_id}"

    # 尺寸数据: 优先使用请求中的值, 其次用默认值
    weight = body.weight_g or 500
    height = body.height_mm or 100
    depth = body.depth_mm or 100
    width = body.width_mm or 100

    # 价格处理
    price_kopecks = str(int(body.price_rub * 100)) if body.price_rub else (
        str(int(record.price * 100)) if record.price else "0"
    )
    old_price_kopecks = str(int(body.old_price_rub * 100)) if body.old_price_rub else (
        str(int(record.old_price * 100)) if record.old_price and record.old_price > record.price else ""
    )

    # 构建 attributes 列表
    ozon_attributes = body.attributes or []
    if not ozon_attributes and record.brand:
        ozon_attributes = [
            {"complex_id": 0, "id": 85, "values": [{"value": record.brand}]},
        ]

    # 构建图片列表
    images = [img for img in (record.images or []) if img and img.startswith("http")]

    item = {
        "offer_id": offer_id,
        "name": record.title,
        "description_category_id": body.description_category_id or record.ozon_category_id or 0,
        "type_id": body.type_id or record.ozon_type_id or 0,
        "barcode": body.barcode or "",
        "dimension_unit": "mm",
        "weight_unit": "g",
        "height": height,
        "depth": depth,
        "width": width,
        "weight": weight,
        "primary_image": images[0] if images else "",
        "images": images[:10],
        "price": price_kopecks,
        "old_price": old_price_kopecks,
        "vat": "0",
        "currency_code": "RUB",
        "attributes": ozon_attributes,
        "status": "processed",
    }

    if body.description:
        item["description"] = body.description
    elif record.description:
        item["description"] = record.description

    # 验证必填字段
    errors = []
    if not item["description_category_id"]:
        errors.append("请先选择 Ozon 商品分类 (description_category_id)")
    if not item["type_id"]:
        errors.append("请先选择 Ozon 商品类型 (type_id)")
    if not images:
        errors.append("商品没有可用图片")
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    try:
        result = client.import_products([item])

        # 保存上传状态到数据库
        task_data = result.get("result", {})
        task_id = 0
        if isinstance(task_data, dict):
            task_ids = task_data.get("task_id", [])
            if task_ids:
                task_id = task_ids[0] if isinstance(task_ids, list) else task_ids

        # 更新记录的 Ozon 分类信息
        record.ozon_category_id = item["description_category_id"]
        record.ozon_type_id = item["type_id"]
        record.upload_status = "uploading"
        record.upload_task_id = str(task_id) if task_id else ""
        record.offer_id = offer_id
        db.commit()

        return {
            "success": True,
            "result": result,
            "task_id": task_id,
            "offer_id": offer_id,
        }
    except Exception as e:
        logger.error("Upload failed for product %d: %s", product_id, str(e))
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@router.post("/products/batch-upload")
def batch_upload_products(body: BatchUploadRequest, db: Session = Depends(get_db)):
    """批量上传选品商品到指定 Ozon 店铺"""
    from app.models.scraped_product import ScrapedProductRecord
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    store = db.query(Store).filter(Store.id == body.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="店铺不存在")

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    records = db.query(ScrapedProductRecord).filter(
        ScrapedProductRecord.id.in_(body.product_ids)
    ).all()

    if not records:
        raise HTTPException(status_code=404, detail="没有找到任何商品")

    items = []
    results = {"success": 0, "failed": 0, "errors": []}

    for record in records:
        try:
            offer_id = f"AUTO-{record.source_id}"
            images = [img for img in (record.images or []) if img and img.startswith("http")]

            if not images:
                results["failed"] += 1
                results["errors"].append({"product_id": record.id, "error": "缺少图片"})
                continue

            price_kopecks = str(int(body.price_rub * 100)) if body.price_rub else (
                str(int(record.price * 100)) if record.price else "0"
            )

            ozon_attributes = body.attributes or []
            if not ozon_attributes and record.brand:
                ozon_attributes = [
                    {"complex_id": 0, "id": 85, "values": [{"value": record.brand}]},
                ]

            item = {
                "offer_id": offer_id,
                "name": record.title,
                "description_category_id": body.description_category_id,
                "type_id": body.type_id,
                "barcode": "",
                "dimension_unit": "mm",
                "weight_unit": "g",
                "height": body.height_mm or 100,
                "depth": body.depth_mm or 100,
                "width": body.width_mm or 100,
                "weight": body.weight_g or 500,
                "primary_image": images[0] if images else "",
                "images": images[:10],
                "price": price_kopecks,
                "old_price": "",
                "vat": "0",
                "currency_code": "RUB",
                "attributes": ozon_attributes,
                "status": "processed",
            }
            items.append(item)

            record.ozon_category_id = body.description_category_id
            record.ozon_type_id = body.type_id
            record.upload_status = "pending"
            record.offer_id = offer_id
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"product_id": record.id, "error": str(e)})

    if not items:
        db.commit()
        return {"success": True, "result": results}

    try:
        import_result = client.import_products(items)
        results["success"] = len(items)

        task_data = import_result.get("result", {})
        task_id = 0
        if isinstance(task_data, dict):
            task_ids = task_data.get("task_id", [])
            task_id = task_ids[0] if isinstance(task_ids, list) and task_ids else 0

        for record in records:
            if record.upload_status == "pending":
                record.upload_status = "uploading"
                record.upload_task_id = str(task_id) if task_id else ""

        db.commit()
        return {"success": True, "result": results, "task_id": task_id}
    except Exception as e:
        db.rollback()
        logger.error("Batch upload failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"批量上传失败: {str(e)}")


@router.post("/products/{product_id}/upload-status")
def update_upload_status(product_id: int, db: Session = Depends(get_db)):
    """查询并更新商品的 Ozon 上架状态"""
    from app.models.scraped_product import ScrapedProductRecord
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == product_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="商品不存在")

    if not record.upload_task_id:
        return {"upload_status": record.upload_status or "not_uploaded"}

    store = db.query(Store).first()
    if not store:
        return {"upload_status": record.upload_status or "unknown"}

    try:
        client = OzonClient(client_id=store.client_id, api_key=store.api_key)
        task_id = int(record.upload_task_id)
        status_list = client.get_import_tasks_status([task_id])

        if status_list:
            task_info = status_list[0]
            ozon_status = task_info.get("status", "")
            status_map = {
                "pending": "pending",
                "processing": "uploading",
                "processed": "success",
                "failed": "failed",
            }
            new_status = status_map.get(ozon_status, ozon_status)

            errors = task_info.get("errors", [])
            error_msg = ""
            if errors:
                error_msg = "; ".join(
                    f"{e.get('field', '')}: {e.get('message', '')}" for e in errors
                )

            record.upload_status = new_status
            if new_status == "success":
                products = client.get_product_list_by_task_id(task_id)
                if products:
                    record.ozon_product_id = products[0].get("product_id", 0)
                    record.matched = True

            db.commit()

            return {
                "upload_status": new_status,
                "ozon_status": ozon_status,
                "errors": error_msg,
                "ozon_product_id": record.ozon_product_id or 0,
            }
    except Exception as e:
        logger.warning("Failed to check upload status: %s", str(e))

    return {"upload_status": record.upload_status or "unknown"}


@router.get("/ozon-categories")
def get_ozon_categories(
    category_id: int = Query(0, description="父分类ID, 0=根分类"),
    store_id: Optional[int] = Query(None, description="店铺ID"),
    language: str = Query("EN", description="语言: EN/DEFAULT"),
    db: Session = Depends(get_db),
):
    """获取 Ozon 商品分类树"""
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    store = None
    if store_id:
        store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        store = db.query(Store).first()
    if not store:
        raise HTTPException(status_code=404, detail="未找到已配置的店铺")

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)

    try:
        tree = client.get_category_tree(category_id=category_id, language=language)
        return {"categories": tree}
    except Exception as e:
        logger.error("Failed to get category tree: %s", str(e))
        raise HTTPException(status_code=502, detail=f"获取分类失败: {str(e)}")


@router.get("/ozon-attributes")
def get_ozon_attributes(
    description_category_id: int = Query(..., description="Ozon 分类ID"),
    type_id: int = Query(0, description="Ozon 类型ID"),
    store_id: Optional[int] = Query(None, description="店铺ID"),
    db: Session = Depends(get_db),
):
    """获取 Ozon 某分类下的所有属性"""
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    store = None
    if store_id:
        store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        store = db.query(Store).first()
    if not store:
        raise HTTPException(status_code=404, detail="未找到已配置的店铺")

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)

    try:
        attrs = client.get_category_attributes(
            description_category_id=description_category_id,
            type_id=type_id,
        )
        return {"attributes": attrs}
    except Exception as e:
        logger.error("Failed to get attributes: %s", str(e))
        raise HTTPException(status_code=502, detail=f"获取属性失败: {str(e)}")


@router.get("/ozon-attribute-values")
def get_ozon_attribute_values(
    description_category_id: int = Query(...),
    attribute_id: int = Query(...),
    type_id: int = Query(0),
    store_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """获取 Ozon 字典类型属性的可选值列表"""
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    store = None
    if store_id:
        store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        store = db.query(Store).first()
    if not store:
        raise HTTPException(status_code=404, detail="未找到已配置的店铺")

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)

    try:
        values = client.get_category_attribute_values(
            description_category_id=description_category_id,
            attribute_id=attribute_id,
            type_id=type_id,
        )
        return {"values": values}
    except Exception as e:
        logger.error("Failed to get attribute values: %s", str(e))
        raise HTTPException(status_code=502, detail=f"获取属性值失败: {str(e)}")


@router.post("/price-calc")
def calculate_price(body: PriceCalcRequest):
    """价格换算计算器

    从 1688 人民币价格换算到 Ozon 卢布售价。
    公式: Ozon售价(₽) = 成本(¥) × 汇率 × 倍率 ÷ (1 - 佣金率) + 物流费 + 包装费
    """
    cost_rub = body.price_cny * body.exchange_rate
    markup = cost_rub * body.markup_factor
    commission = markup * (body.commission_pct / 100)
    final_price = markup + commission + body.logistics_rub + body.packaging_rub

    final_price = round(final_price, 2)
    if final_price < 50:
        final_price = 50

    return {
        "cost_cny": body.price_cny,
        "cost_rub": round(cost_rub, 2),
        "markup_price_rub": round(markup, 2),
        "commission_rub": round(commission, 2),
        "logistics_rub": body.logistics_rub,
        "packaging_rub": body.packaging_rub,
        "final_price_rub": final_price,
        "exchange_rate": body.exchange_rate,
        "markup_factor": body.markup_factor,
        "commission_pct": body.commission_pct,
    }


@router.get("/stores")
def list_stores(db: Session = Depends(get_db)):
    """获取可用店铺列表(用于上传选择)"""
    stores = store_crud.get_stores(db, limit=100)
    return [{"id": s.id, "name": s.name, "client_id": s.client_id} for s in stores]
