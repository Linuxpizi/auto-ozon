"""选品中心 — 从浏览器采集的 Ozon 商品数据导入与展示"""
import json
import logging
import os
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db

logger = logging.getLogger(__name__)
from app.crud import scraped_product as sp_crud
from app.crud import store as store_crud
from app.schemas.scraped_product import ScrapedProductCreate, ScrapedProductRead
from app.services import upload_service

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
    tags: Optional[List[str]] = None
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
    price_rub: Optional[float] = None
    old_price_rub: Optional[float] = None
    weight_g: Optional[int] = None
    height_mm: Optional[int] = None
    depth_mm: Optional[int] = None
    width_mm: Optional[int] = None
    barcode: str = ""
    description: str = ""
    package_override_reason: Optional[str] = None


class BatchUploadRequest(BaseModel):
    """批量上传到店铺"""
    product_ids: List[int]
    store_id: int
    description_category_id: int
    type_id: int
    price_rub: Optional[float] = None
    old_price_rub: Optional[float] = None
    weight_g: Optional[int] = None
    height_mm: Optional[int] = None
    depth_mm: Optional[int] = None
    width_mm: Optional[int] = None
    package_override_reason: Optional[str] = None


class CategoryTreeRequest(BaseModel):
    """查询 Ozon 分类树"""
    category_id: int = 0
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


def _direct_package_overrides(body: Any) -> dict[str, int]:
    requested = {
        "weight": getattr(body, "weight_g", None),
        "height": getattr(body, "height_mm", None),
        "depth": getattr(body, "depth_mm", None),
        "width": getattr(body, "width_mm", None),
    }
    return {
        field: normalized
        for field, value in requested.items()
        if (normalized := _positive_int(value)) > 0
    }


def _build_direct_upload_draft(record, body: Any, *, offer_id: str):
    """Normalize a selection record through the shared strict draft boundary."""
    package_overrides = _direct_package_overrides(body)
    override_reason = str(getattr(body, "package_override_reason", None) or "").strip()
    if package_overrides and not override_reason:
        raise upload_service.OzonItemValidationError([
            "手工修改包装重量或尺寸时必须填写 package_override_reason",
        ])

    requested_price = getattr(body, "price_rub", None)
    requested_old_price = getattr(body, "old_price_rub", None)
    draft = upload_service.build_transient_draft_from_scraped(
        record,
        body.store_id,
        source_sku=str(record.selected_sku or ""),
        description_category_id=getattr(body, "description_category_id", 0) or 0,
        type_id=getattr(body, "type_id", 0) or 0,
        offer_id=offer_id,
        price_rub=float(requested_price) if requested_price and requested_price > 0 else 0.0,
        old_price_rub=float(requested_old_price) if requested_old_price and requested_old_price > 0 else 0.0,
    )

    # The legacy direct API treats collected prices as RUB. Preserve that
    # compatibility, but use the exact selected-SKU price exposed by the
    # canonical mapper and never allow zero through strict readiness.
    if not requested_price or requested_price <= 0:
        draft.price_rub = float(draft.price_cny or 0)

    barcode = str(getattr(body, "barcode", "") or "").strip()
    description = str(getattr(body, "description", "") or "").strip()
    if barcode:
        draft.barcode = barcode
    if description:
        draft.description = description

    if package_overrides:
        for field, value in package_overrides.items():
            setattr(draft, field, value)
        draft.package_override_audit = upload_service.apply_package_override_audit(
            draft,
            package_overrides,
            override_reason,
        )
    return draft


def _extract_task_ids(result: Any) -> list[int]:
    """Accept current list and legacy dict-shaped Ozon import responses."""
    payload = result.get("result", []) if isinstance(result, dict) else []
    if isinstance(payload, dict):
        payload = payload.get("task_id", [])
    if not isinstance(payload, list):
        payload = [payload]
    task_ids: list[int] = []
    for value in payload:
        try:
            task_id = int(value)
        except (TypeError, ValueError):
            continue
        if task_id > 0:
            task_ids.append(task_id)
    return task_ids


def _dimension_response(draft) -> dict[str, Any]:
    audit = draft.package_override_audit if isinstance(draft.package_override_audit, dict) else {}
    facts = draft.package_facts if isinstance(draft.package_facts, dict) else {}
    provenance = facts.get("packagePhysicalProvenance", {})
    fact_keys = {
        "weight": "packageWeightG",
        "height": "packageHeightMm",
        "depth": "packageDepthMm",
        "width": "packageWidthMm",
    }
    sources: dict[str, str] = {}
    for field, fact_key in fact_keys.items():
        if field in audit:
            sources[field] = "manual_override"
        else:
            source = provenance.get(fact_key, {}) if isinstance(provenance, dict) else {}
            sources[field] = str(source.get("source") or "collected_package_fact")
    return {
        "weight_g": draft.weight,
        "height_mm": draft.height,
        "depth_mm": draft.depth,
        "width_mm": draft.width,
        "sources": sources,
        "missing": [],
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
    2. 用户选择分类后，调用此接口提交上架
    """
    from app.models.scraped_product import ScrapedProductRecord
    from app.models.store import Store
    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == product_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="商品不存在")

    store = db.query(Store).filter(Store.id == body.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="店铺不存在")

    offer_id = str(body.offer_id or "").strip() or f"AUTO-{record.source_id}"
    try:
        draft = _build_direct_upload_draft(record, body, offer_id=offer_id)
        item = upload_service._build_ozon_item(draft)
    except upload_service.OzonItemValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        from app.services.ozon_client import OzonClient

        client = OzonClient(client_id=store.client_id, api_key=store.api_key)
        result = client.import_products(items=[item])
        task_ids = _extract_task_ids(result)
        task_id = task_ids[0] if task_ids else 0

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
            "dimensions": _dimension_response(draft),
        }
    except Exception as e:
        db.rollback()
        logger.error("Upload failed for product %d: %s", product_id, str(e))
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@router.post("/products/batch-upload")
def batch_upload_products(body: BatchUploadRequest, db: Session = Depends(get_db)):
    """批量上传选品商品到指定 Ozon 店铺"""
    from app.models.scraped_product import ScrapedProductRecord
    from app.models.store import Store

    store = db.query(Store).filter(Store.id == body.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="店铺不存在")

    records = db.query(ScrapedProductRecord).filter(
        ScrapedProductRecord.id.in_(body.product_ids)
    ).all()

    if not records:
        raise HTTPException(status_code=404, detail="没有找到任何商品")

    results = {"success": 0, "failed": 0, "errors": []}
    records_by_id = {record.id: record for record in records}
    valid_uploads = []

    for product_id in body.product_ids:
        record = records_by_id.get(product_id)
        if record is None:
            results["failed"] += 1
            results["errors"].append({"product_id": product_id, "error": "商品不存在"})
            continue
        try:
            offer_id = f"AUTO-{record.source_id}"
            draft = _build_direct_upload_draft(record, body, offer_id=offer_id)
            item = upload_service._build_ozon_item(draft)
            valid_uploads.append((record.id, offer_id, item))
        except upload_service.OzonItemValidationError as exc:
            results["failed"] += 1
            results["errors"].append({"product_id": record.id, "error": str(exc)})

    if not valid_uploads:
        return {"success": True, "result": results}

    from app.services.ozon_client import OzonClient

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    first_task_id = 0
    for chunk_start in range(0, len(valid_uploads), 100):
        chunk = valid_uploads[chunk_start:chunk_start + 100]
        try:
            import_result = client.import_products(items=[entry[2] for entry in chunk])
            task_ids = _extract_task_ids(import_result)
            fallback_task_id = task_ids[0] if task_ids else 0
            if not first_task_id:
                first_task_id = fallback_task_id

            for index, (product_id, offer_id, item) in enumerate(chunk):
                record = records_by_id[product_id]
                task_id = task_ids[index] if index < len(task_ids) else fallback_task_id
                record.ozon_category_id = item["description_category_id"]
                record.ozon_type_id = item["type_id"]
                record.upload_status = "uploading"
                record.upload_task_id = str(task_id) if task_id else ""
                record.offer_id = offer_id

            db.commit()
            results["success"] += len(chunk)
        except Exception as exc:
            db.rollback()
            logger.error(
                "Batch upload chunk failed for products %s: %s",
                [entry[0] for entry in chunk],
                str(exc),
            )
            results["failed"] += len(chunk)
            results["errors"].extend(
                {"product_id": product_id, "error": str(exc)}
                for product_id, _, _ in chunk
            )

    return {"success": True, "result": results, "task_id": first_task_id}


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
    store_id: Optional[int] = Query(None, description="兼容旧客户端；本地读取不需要店铺"),
    language: str = Query("ZH_HANS", description="本地分类语言，当前仅支持 ZH_HANS"),
    db: Session = Depends(get_db),
):
    """从应用数据库读取完整中文 Ozon 分类树，不访问 Ozon。"""
    from app.services.ozon_category_service import CHINESE_LANGUAGE, get_category_tree_snapshot

    if language != CHINESE_LANGUAGE:
        raise HTTPException(status_code=400, detail="本地分类库当前仅支持 ZH_HANS")
    return get_category_tree_snapshot(db, language=language)


@router.post("/ozon-categories/sync")
def sync_ozon_categories(
    store_id: int = Query(..., description="用于调用 Ozon 的店铺 ID"),
    db: Session = Depends(get_db),
):
    """通过指定店铺凭证拉取完整中文分类，并原子替换本地快照。"""
    from app.models.store import Store
    from app.services.ozon_category_service import CHINESE_LANGUAGE, replace_category_snapshot
    from app.services.ozon_client import OzonClient

    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="未找到该店铺")

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    try:
        tree = client.get_category_tree(language=CHINESE_LANGUAGE)
        return replace_category_snapshot(
            db,
            tree,
            source_store_id=store.id,
            language=CHINESE_LANGUAGE,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        logger.error("Failed to sync Ozon category tree: %s", str(exc))
        raise HTTPException(status_code=502, detail=f"同步分类失败: {str(exc)}") from exc


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
    """将1688同款链接绑定到选品商品，并回填可核验的物理规格。"""
    from app.models.scraped_product import ScrapedProductRecord

    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == product_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="商品不存在")

    record.supplier_url = body.url or (
        f"https://detail.1688.com/offer/{body.offer_id}.html" if body.offer_id else ""
    )
    if body.seller:
        record.seller_name = body.seller

    # 如果有1688链接，尝试抓取规格参数
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
        except Exception as e:
            logger.warning("Failed to scrape 1688 specs: %s", e)

    db.commit()
    db.refresh(record)

    return {
        "success": True,
        "product_id": product_id,
    }


@router.post("/products/{product_id}/extract-1688-specs")
def extract_1688_specs_for_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    """重新从1688提取物理规格并回填到选品商品。"""
    from app.models.scraped_product import ScrapedProductRecord

    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == product_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="商品不存在")

    url_1688 = record.supplier_url or record.source_url or ""

    if not url_1688 or "1688.com" not in url_1688:
        raise HTTPException(status_code=400, detail="该商品未绑定1688链接，无法提取参数")

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

    except Exception as e:
        logger.warning("Failed to re-extract 1688 specs: %s", e)
        raise HTTPException(status_code=500, detail=f"1688参数提取失败: {e}")

    db.commit()
    db.refresh(record)

    return {
        "success": True,
        "product_id": product_id,
        "weight_g": record.weight_g,
        "depth_mm": record.depth_mm,
        "height_mm": record.height_mm,
        "width_mm": record.width_mm,
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
