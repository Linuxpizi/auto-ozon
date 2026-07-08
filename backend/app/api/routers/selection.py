"""选品中心 — 从浏览器采集的 Ozon 商品数据导入与展示"""
import json
import logging
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db

logger = logging.getLogger(__name__)
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
    video_urls: Optional[List[str]] = None
    sku_list: Optional[List[dict]] = None
    spec_list: Optional[List[dict]] = None
    description_category_id: Optional[int] = None
    type_id: Optional[int] = None
    ozon_category_id: Optional[int] = None
    ozon_type_id: Optional[int] = None


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
    language: str = "ZH"


class CategoryAttributeRequest(BaseModel):
    """查询分类属性"""
    description_category_id: int
    type_id: int = 0
    language: str = "ZH"


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


def _positive_int(value) -> int:
    """安全转换为正整数；空值、0、非法值都视为缺失。"""
    try:
        parsed = int(float(value))
        return parsed if parsed > 0 else 0
    except (TypeError, ValueError):
        return 0


def _first_spec(record) -> dict:
    """读取采集规格 spec_list[0]，兼容数据库 JSON 被序列化成字符串的情况。"""
    spec_list = getattr(record, "spec_list", None) or []
    if isinstance(spec_list, str):
        try:
            spec_list = json.loads(spec_list)
        except Exception:
            spec_list = []
    if isinstance(spec_list, list) and spec_list and isinstance(spec_list[0], dict):
        return spec_list[0]
    return {}


def _resolve_upload_dimensions(record, *, weight_g=None, height_mm=None, depth_mm=None, width_mm=None) -> tuple[int, int, int, int, dict]:
    """上传尺寸/重量优先级：用户输入 > 采集 spec_list > 安全默认值。

    返回：(weight, height, depth, width, meta)。meta 用于日志/响应，方便定位哪些字段仍在使用默认值。
    """
    spec = _first_spec(record)
    requested = {
        "weight": _positive_int(weight_g),
        "height": _positive_int(height_mm),
        "depth": _positive_int(depth_mm),
        "width": _positive_int(width_mm),
    }
    scraped = {
        "weight": _positive_int(spec.get("weight_g")),
        "height": _positive_int(spec.get("height_mm")),
        "depth": _positive_int(spec.get("depth_mm")),
        "width": _positive_int(spec.get("width_mm")),
    }
    defaults = {"weight": 500, "height": 100, "depth": 100, "width": 100}

    values = {}
    sources = {}
    for key in ("weight", "height", "depth", "width"):
        if requested[key]:
            values[key] = requested[key]
            sources[key] = "request"
        elif scraped[key]:
            values[key] = scraped[key]
            sources[key] = "spec_list"
        else:
            values[key] = defaults[key]
            sources[key] = "default"

    missing = [key for key, source in sources.items() if source == "default"]
    if missing:
        logger.warning(
            "Product %s missing upload dimensions %s, using safe defaults",
            getattr(record, "id", None),
            missing,
        )

    return values["weight"], values["height"], values["depth"], values["width"], {
        "sources": sources,
        "missing": missing,
        "scraped_spec": spec,
    }


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
    description_category_id = update_data.pop("description_category_id", None)
    type_id = update_data.pop("type_id", None)
    ozon_category_id = update_data.pop("ozon_category_id", None)
    ozon_type_id = update_data.pop("ozon_type_id", None)

    if description_category_id is not None:
        record.ozon_category_id = int(description_category_id or 0)
    elif ozon_category_id is not None:
        record.ozon_category_id = int(ozon_category_id or 0)

    if type_id is not None:
        record.ozon_type_id = int(type_id or 0)
    elif ozon_type_id is not None:
        record.ozon_type_id = int(ozon_type_id or 0)

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

    # 尺寸数据: 优先使用请求中的值，其次使用采集 spec_list，最后才使用安全默认值
    weight, height, depth, width, dimensions_meta = _resolve_upload_dimensions(
        record,
        weight_g=body.weight_g,
        height_mm=body.height_mm,
        depth_mm=body.depth_mm,
        width_mm=body.width_mm,
    )

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
            "dimensions": {
                "weight_g": weight,
                "height_mm": height,
                "depth_mm": depth,
                "width_mm": width,
                **dimensions_meta,
            },
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

            weight, height, depth, width, dimensions_meta = _resolve_upload_dimensions(
                record,
                weight_g=body.weight_g,
                height_mm=body.height_mm,
                depth_mm=body.depth_mm,
                width_mm=body.width_mm,
            )
            if dimensions_meta["missing"]:
                results["errors"].append({
                    "product_id": record.id,
                    "warning": f"缺少 {', '.join(dimensions_meta['missing'])}，已使用安全默认值",
                })

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
                "height": height,
                "depth": depth,
                "width": width,
                "weight": weight,
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
    store_id: int = Query(..., description="店铺ID (必填)"),
    language: str = Query("ZH_HANS", description="语言: ZH_HANS/RU/EN"),
    db: Session = Depends(get_db),
):
    """获取 Ozon 商品分类树 - 必须传入 store_id"""
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="未找到该店铺")

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)

    try:
        tree = client.get_category_tree(language=language)
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


class Search1688Request(BaseModel):
    keyword: str
    page: int = 1
    page_size: int = 20


class Link1688Request(BaseModel):
    """将1688同款链接绑定到选品商品"""
    offer_id: str = ""
    url: str = ""
    title: str = ""
    price: float = 0.0
    image: str = ""
    seller: str = ""


@router.post("/search-1688")
async def search_1688_products(body: Search1688Request):
    """在1688上搜索同款商品"""
    from app.services.scrapers.scraper_1688 import search_1688

    results = await search_1688(
        keyword=body.keyword,
        page=body.page,
        page_size=body.page_size,
    )
    return {"items": results, "total": len(results)}


@router.post("/products/{product_id}/link-1688")
def link_1688_to_product(
    product_id: int,
    body: Link1688Request,
    db: Session = Depends(get_db),
):
    """将1688同款链接绑定到选品商品，并自动提取规格参数"""
    from app.models.scraped_product import ScrapedProductRecord

    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == product_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="商品不存在")

    # 更新1688关联信息
    existing_attrs = record.attributes or []
    supplier_info = {
        "name": "1688_同款链接",
        "value": body.url or f"https://detail.1688.com/offer/{body.offer_id}.html",
    }
    # 移除旧的1688链接属性
    existing_attrs = [a for a in existing_attrs if a.get("name") != "1688_同款链接"]
    existing_attrs.append(supplier_info)
    if body.offer_id:
        existing_attrs.append({"name": "1688_offer_id", "value": body.offer_id})
    if body.seller:
        existing_attrs.append({"name": "1688_供应商", "value": body.seller})

    record.attributes = existing_attrs

    # 如果有1688链接，尝试抓取规格参数
    specs_extracted = []
    if body.url:
        try:
            from app.services.scrapers.scraper_1688 import Ali1688Scraper
            import asyncio

            scraper = Ali1688Scraper()
            product_data = asyncio.get_event_loop().run_until_complete(scraper.scrape(body.url))
            if product_data and product_data.extra:
                # 提取规格参数
                for key in ("weight", "dimensions"):
                    if key in product_data.extra and product_data.extra[key]:
                        if key == "weight":
                            try:
                                record.weight_g = int(product_data.extra[key])
                            except (ValueError, TypeError):
                                pass
                        elif key == "dimensions":
                            record.depth_mm = int(product_data.extra[key].get("depth", 0) or 0)
                            record.height_mm = int(product_data.extra[key].get("height", 0) or 0)
                            record.width_mm = int(product_data.extra[key].get("width", 0) or 0)
            # 提取属性
            if product_data and product_data.attributes:
                specs_extracted = [
                    {"name": attr.name, "value": attr.value}
                    for attr in product_data.attributes
                ]
                # 合并属性（不覆盖已有的）
                existing_names = {a.get("name") for a in existing_attrs}
                for spec in specs_extracted:
                    if spec["name"] not in existing_names:
                        existing_attrs.append(spec)
                record.attributes = existing_attrs
        except Exception as e:
            logger.warning("Failed to scrape 1688 specs: %s", e)

    db.commit()
    db.refresh(record)

    return {
        "success": True,
        "product_id": product_id,
        "specs_extracted": specs_extracted,
        "total_attributes": len(record.attributes or []),
    }


@router.post("/products/{product_id}/extract-1688-specs")
def extract_1688_specs_for_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    """重新从1688提取规格参数并回填到选品商品（支持已绑定1688链接的商品）"""
    from app.models.scraped_product import ScrapedProductRecord

    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == product_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="商品不存在")

    # 查找1688链接
    existing_attrs = record.attributes or []
    link_attr = next((a for a in existing_attrs if a.get("name") == "1688_同款链接"), None)
    url_1688 = link_attr.get("value") if link_attr else None

    if not url_1688:
        # 也检查 source_url
        url_1688 = record.source_url or ""

    if not url_1688 or "1688.com" not in url_1688:
        raise HTTPException(status_code=400, detail="该商品未绑定1688链接，无法提取参数")

    specs_extracted = []
    try:
        from app.services.scrapers.scraper_1688 import Ali1688Scraper
        import asyncio

        scraper = Ali1688Scraper()
        product_data = asyncio.get_event_loop().run_until_complete(scraper.scrape(url_1688))

        if product_data:
            # 提取重量
            if product_data.extra and "weight" in product_data.extra and product_data.extra["weight"]:
                try:
                    record.weight_g = int(product_data.extra["weight"])
                except (ValueError, TypeError):
                    pass

            # 提取尺寸
            if product_data.extra and "dimensions" in product_data.extra and product_data.extra["dimensions"]:
                dims = product_data.extra["dimensions"]
                record.depth_mm = int(dims.get("depth", 0) or 0)
                record.height_mm = int(dims.get("height", 0) or 0)
                record.width_mm = int(dims.get("width", 0) or 0)

            # 提取所有属性
            if product_data.attributes:
                specs_extracted = [
                    {"name": attr.name, "value": attr.value}
                    for attr in product_data.attributes
                ]
                # 合并属性（不覆盖已有的同名属性，但更新1688特有的）
                existing_names = {a.get("name") for a in existing_attrs}
                skip_names = {"1688_同款链接", "1688_同款标题", "1688_offer_id", "1688_供应商"}
                for spec in specs_extracted:
                    if spec["name"] not in existing_names and spec["name"] not in skip_names:
                        existing_attrs.append(spec)
                record.attributes = existing_attrs

            # 更新标题（如果1688有更完整的标题）
            if product_data.title and not link_attr:
                # 仅在未绑定时更新
                pass  # 不自动覆盖用户编辑的标题

    except Exception as e:
        logger.warning("Failed to re-extract 1688 specs: %s", e)
        raise HTTPException(status_code=500, detail=f"1688参数提取失败: {e}")

    db.commit()
    db.refresh(record)

    return {
        "success": True,
        "product_id": product_id,
        "specs_extracted": specs_extracted,
        "weight_g": record.weight_g,
        "depth_mm": record.depth_mm,
        "height_mm": record.height_mm,
        "width_mm": record.width_mm,
        "total_attributes": len(record.attributes or []),
    }


class SmartPricingRequest(BaseModel):
    """智能定价请求"""
    product_id: int
    cost_cny: float = 0.0
    shipping_cny: float = 0.0
    packaging_cny: float = 0.0
    exchange_rate: float = 12.5
    ozon_commission_pct: float = 15.0
    target_margin_pct: float = 30.0
    competitor_price_rub: float = 0.0


@router.post("/smart-pricing")
def smart_pricing(body: SmartPricingRequest, db: Session = Depends(get_db)):
    """智能定价：根据成本、汇率、佣金、利润率自动计算建议价格"""
    from app.services.smart_pricing_service import calculate_smart_price, PricingInput
    from app.models.scraped_product import ScrapedProductRecord

    # 如果指定了 product_id，自动获取成本价
    if body.product_id:
        record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == body.product_id).first()
        if record and body.cost_cny <= 0:
            body.cost_cny = record.price or 0.0

    inp = PricingInput(
        cost_cny=body.cost_cny,
        shipping_cny=body.shipping_cny,
        packaging_cny=body.packaging_cny,
        exchange_rate=body.exchange_rate,
        ozon_commission_pct=body.ozon_commission_pct,
        target_margin_pct=body.target_margin_pct,
        competitor_price_rub=body.competitor_price_rub,
    )

    result = calculate_smart_price(inp)

    return {
        "suggested_price_rub": result.suggested_price_rub,
        "old_price_rub": result.old_price_rub,
        "cost_total_cny": result.cost_total_cny,
        "cost_total_rub": result.cost_total_rub,
        "margin_pct": result.margin_pct,
        "profit_rub": result.profit_rub,
        "commission_rub": result.commission_rub,
        "breakdown": result.breakdown,
    }


@router.get("/stores")
def list_stores(db: Session = Depends(get_db)):
    """获取可用店铺列表(用于上传选择)"""
    stores = store_crud.get_stores(db, limit=100)
    return [{"id": s.id, "name": s.name, "client_id": s.client_id} for s in stores]
