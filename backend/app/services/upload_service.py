"""
Unified Upload Service — 单一入口处理采集商品 → Ozon 上架全流程。

设计原则：
  1. 所有 Ozon API 交互集中在此服务，不在 router 层构建 payload
  2. 草稿 (UploadDraft) 作为中间态，支持 review/edit → submit → track
  3. 批量操作与单条操作使用同一底层方法
"""

import json
import logging
import re
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.upload_draft import UploadDraft
from app.models.scraped_product import ScrapedProductRecord
from app.models.store import Store
from app.services.ozon_client import OzonClient
import app.crud.upload_draft as draft_crud

logger = logging.getLogger(__name__)


# ── Price conversion helpers ──────────────────────────────────────────

def generate_offer_id(
    source_product_id: int,
    source_sku: str = "",
    prefix: str = "",
) -> str:
    """生成唯一的 offer_id。格式: prefix-sku-pid 或 prefix-pid"""
    short_uuid = uuid.uuid4().hex[:6]
    if source_sku:
        return f"{prefix}{source_sku}-{short_uuid}" if prefix else f"{source_sku}-{short_uuid}"
    return f"{prefix}SP{source_product_id}-{short_uuid}" if prefix else f"SP{source_product_id}-{short_uuid}"


def convert_price_to_rub(
    price_cny: float,
    exchange_rate: float = 0.0,
    markup_pct: float = 0.0,
    commission_pct: float = 0.0,
) -> float:
    """CNY → RUB 定价公式：(CNY × 汇率) × (1 + markup%) × (1 + commission%)"""
    if price_cny <= 0:
        return 0.0
    rate = exchange_rate if exchange_rate > 0 else 12.5
    base = price_cny * rate
    markup_mult = 1.0 + (markup_pct / 100.0) if markup_pct > 0 else 1.0
    comm_mult = 1.0 + (commission_pct / 100.0) if commission_pct > 0 else 1.0
    return round(base * markup_mult * comm_mult, 2)


def price_to_kopecks(price_rub: float) -> str:
    """RUB → kopecks string for Ozon API"""
    if price_rub <= 0:
        return ""
    return str(int(price_rub * 100))


# ── Draft creation ────────────────────────────────────────────────────

def create_draft_from_scraped(
    db: Session,
    store_id: int,
    source_product_id: int,
    *,
    description_category_id: int = 0,
    type_id: int = 0,
    offer_id: str = "",
    name: str = "",
    price_rub: float = 0.0,
    old_price_rub: float = 0.0,
    attributes: list = [],
) -> UploadDraft:
    """从单个采集商品创建上架草稿"""
    record = db.query(ScrapedProductRecord).filter(
        ScrapedProductRecord.id == source_product_id
    ).first()
    if not record:
        raise ValueError(f"采集商品 {source_product_id} 不存在")

    # Images: filter valid HTTP URLs
    raw_images = record.images if isinstance(record.images, list) else []
    valid_images = [img for img in raw_images if img and isinstance(img, str) and img.startswith("http")]

    # Auto-generate offer_id if empty
    if not offer_id:
        offer_id = generate_offer_id(source_product_id, record.source_id)

    draft_data = {
        "store_id": store_id,
        "source_type": "scraped",
        "source_product_id": source_product_id,
        "source_sku": record.source_id or "",
        "source_name": record.title or "",
        "source_url": "",
        "source_images": valid_images,
        "description_category_id": description_category_id,
        "type_id": type_id,
        "offer_id": offer_id,
        "name": name or record.title or "",
        "price_cny": record.price or 0.0,
        "price_rub": price_rub,
        "old_price_rub": old_price_rub,
        "primary_image": valid_images[0] if valid_images else "",
        "images": valid_images[:15],
        "attributes": attributes,
        "weight": 500,
        "height": 100,
        "depth": 100,
        "width": 100,
        "status": "draft" if not description_category_id else "ready",
    }

    return draft_crud.create_draft(db, draft_data)


def create_drafts_batch(
    db: Session,
    store_id: int,
    source_product_ids: List[int],
    *,
    description_category_id: int = 0,
    type_id: int = 0,
    offer_id_prefix: str = "",
    price_rub: float = 0.0,
    old_price_rub: float = 0.0,
    markup_pct: float = 0.0,
    exchange_rate: float = 0.0,
    attributes: list = [],
) -> List[UploadDraft]:
    """批量从采集商品创建上架草稿"""
    results = []
    for pid in source_product_ids:
        try:
            # Get scraped product for price conversion
            record = db.query(ScrapedProductRecord).filter(
                ScrapedProductRecord.id == pid
            ).first()
            if not record:
                logger.warning("Skip product %d: not found", pid)
                continue

            # Auto price: use markup if provided, otherwise use manual price_rub
            auto_price_rub = price_rub
            if markup_pct > 0 and record.price and record.price > 0:
                auto_price_rub = convert_price_to_rub(
                    record.price, exchange_rate=exchange_rate, markup_pct=markup_pct
                )

            # Auto offer_id per product
            auto_offer_id = generate_offer_id(pid, record.source_id, prefix=offer_id_prefix)

            draft = create_draft_from_scraped(
                db, store_id, pid,
                description_category_id=description_category_id,
                type_id=type_id,
                offer_id=auto_offer_id,
                price_rub=auto_price_rub,
                old_price_rub=old_price_rub,
                attributes=attributes,
            )
            results.append(draft)
        except Exception as e:
            logger.error("Failed to create draft for product %d: %s", pid, str(e))

    return results


# ── Ozon payload builder ──────────────────────────────────────────────

def _build_ozon_item(draft: UploadDraft) -> dict:
    """将 UploadDraft 转为 Ozon /v3/product/import 所需的 item dict"""
    images = draft.images if isinstance(draft.images, list) else []
    valid_images = [img for img in images if img and isinstance(img, str) and img.startswith("http")]

    item = {
        "offer_id": draft.offer_id,
        "name": draft.name,
        "description_category_id": draft.description_category_id,
        "type_id": draft.type_id,
        "barcode": "",
        "dimension_unit": "mm",
        "weight_unit": "g",
        "height": draft.height or 100,
        "depth": draft.depth or 100,
        "width": draft.width or 100,
        "weight": draft.weight or 500,
        "primary_image": draft.primary_image or (valid_images[0] if valid_images else ""),
        "images": valid_images[:10],
        "price": price_to_kopecks(draft.price_rub),
        "old_price": price_to_kopecks(draft.old_price_rub),
        "vat": draft.vat or "0",
        "currency_code": "RUB",
        "status": "processed",
    }

    # Attributes
    attrs = draft.attributes if isinstance(draft.attributes, list) else []
    if attrs:
        item["attributes"] = attrs
    else:
        item["attributes"] = []

    return item


# ── Submit to Ozon ────────────────────────────────────────────────────

def submit_draft_to_ozon(
    db: Session,
    draft_id: int,
) -> dict:
    """提交单个草稿到 Ozon，返回 {success, task_id, error}"""
    draft = draft_crud.get_draft(db, draft_id)
    if not draft:
        raise ValueError(f"草稿 {draft_id} 不存在")

    if draft.status not in ("draft", "ready", "error"):
        raise ValueError(f"草稿状态 {draft.status} 不可提交")

    store = db.query(Store).filter(Store.id == draft.store_id).first()
    if not store:
        raise ValueError(f"店铺 {draft.store_id} 不存在")

    draft_crud.update_draft(db, draft_id, {"status": "submitting", "error_message": ""})

    try:
        client = OzonClient(store.api_key, store.client_id)
        item = _build_ozon_item(draft)

        # Only submit if we have required fields
        if not draft.description_category_id or not draft.type_id:
            draft_crud.update_draft(db, draft_id, {
                "status": "error",
                "error_message": "缺少分类 ID 或类型 ID",
            })
            return {"success": False, "task_id": 0, "error": "缺少分类 ID 或类型 ID"}

        result = client.import_products(items=[item])
        task_ids = result.get("result", [])
        ozon_task_id = task_ids[0] if task_ids else 0

        draft_crud.update_draft(db, draft_id, {
            "status": "submitted",
            "ozon_task_id": ozon_task_id,
        })

        return {"success": True, "task_id": ozon_task_id, "error": ""}
    except Exception as e:
        logger.error("Submit draft %d failed: %s", draft_id, str(e))
        draft_crud.update_draft(db, draft_id, {
            "status": "error",
            "error_message": str(e),
        })
        return {"success": False, "task_id": 0, "error": str(e)}


def submit_batch_to_ozon(
    db: Session,
    draft_ids: List[int],
) -> dict:
    """批量提交草稿到 Ozon"""
    # Group by store_id for batch API efficiency
    drafts = draft_crud.get_drafts_by_ids(db, draft_ids)
    if not drafts:
        raise ValueError("未找到指定草稿")

    by_store: dict[int, list[UploadDraft]] = {}
    for d in drafts:
        by_store.setdefault(d.store_id, []).append(d)

    all_results = []
    total_submitted = 0
    total_failed = 0

    for store_id, store_drafts in by_store.items():
        store = db.query(Store).filter(Store.id == store_id).first()
        if not store:
            for d in store_drafts:
                all_results.append({"draft_id": d.id, "success": False, "task_id": 0, "error": "店铺不存在"})
                total_failed += 1
            continue

        # Build all items for this store
        items_to_submit = []
        valid_drafts = []
        for d in store_drafts:
            if d.status not in ("draft", "ready", "error"):
                all_results.append({"draft_id": d.id, "success": False, "task_id": 0, "error": f"状态 {d.status} 不可提交"})
                total_failed += 1
                continue
            if not d.description_category_id or not d.type_id:
                draft_crud.update_draft(db, d.id, {"status": "error", "error_message": "缺少分类或类型 ID"})
                all_results.append({"draft_id": d.id, "success": False, "task_id": 0, "error": "缺少分类或类型 ID"})
                total_failed += 1
                continue

            items_to_submit.append(_build_ozon_item(d))
            valid_drafts.append(d)

        if not items_to_submit:
            continue

        # Batch submit
        try:
            client = OzonClient(store.api_key, store.client_id)
            # Ozon API limits: send in chunks of 100
            CHUNK_SIZE = 100
            task_id_map = {}  # offer_id → task_id

            for i in range(0, len(items_to_submit), CHUNK_SIZE):
                chunk = items_to_submit[i:i + CHUNK_SIZE]
                chunk_drafts = valid_drafts[i:i + CHUNK_SIZE]
                result = client.import_products(items=chunk)
                task_ids = result.get("result", [])

                for j, d in enumerate(chunk_drafts):
                    tid = task_ids[j] if j < len(task_ids) else (task_ids[0] if task_ids else 0)
                    draft_crud.update_draft(db, d.id, {
                        "status": "submitted",
                        "ozon_task_id": tid,
                    })
                    all_results.append({"draft_id": d.id, "success": True, "task_id": tid, "error": ""})
                    total_submitted += 1

        except Exception as e:
            logger.error("Batch submit for store %d failed: %s", store_id, str(e))
            for d in valid_drafts:
                draft_crud.update_draft(db, d.id, {"status": "error", "error_message": str(e)})
                all_results.append({"draft_id": d.id, "success": False, "task_id": 0, "error": str(e)})
                total_failed += 1

    return {
        "total": len(draft_ids),
        "submitted": total_submitted,
        "failed": total_failed,
        "results": all_results,
    }


# ── Status tracking ───────────────────────────────────────────────────

def check_draft_status(
    db: Session,
    draft_id: int,
) -> dict:
    """查询单个草稿的 Ozon 导入状态"""
    draft = draft_crud.get_draft(db, draft_id)
    if not draft:
        raise ValueError(f"草稿 {draft_id} 不存在")

    if draft.status != "submitted" or not draft.ozon_task_id:
        return {"status": draft.status, "message": "尚未提交或无 task_id"}

    store = db.query(Store).filter(Store.id == draft.store_id).first()
    if not store:
        raise ValueError(f"店铺 {draft.store_id} 不存在")

    try:
        client = OzonClient(store.api_key, store.client_id)
        result = client.get_import_tasks_status(task_id=draft.ozon_task_id)

        items = result.get("result", [])
        if items:
            item = items[0] if isinstance(items, list) else items
            ozon_status = item.get("status", "")
            product_id = item.get("product_id", 0)
            errors = item.get("errors", [])
            error_msg = ""
            if errors:
                error_msg = "; ".join(
                    e.get("message", str(e)) if isinstance(e, dict) else str(e)
                    for e in errors
                )

            if ozon_status == "success":
                new_status = "active"
            elif ozon_status in ("pending", "processing"):
                new_status = "processing"
            else:
                new_status = "error"
                error_msg = error_msg or f"Ozon status: {ozon_status}"

            update = {"status": new_status, "ozon_last_synced_at": datetime.now()}
            if product_id:
                update["ozon_product_id"] = product_id
            if error_msg:
                update["error_message"] = error_msg

            draft_crud.update_draft(db, draft_id, update)

            return {
                "status": new_status,
                "product_id": product_id,
                "errors": errors,
            }

        return {"status": draft.status, "message": "未获取到导入结果"}
    except Exception as e:
        logger.error("Check status failed for draft %d: %s", draft_id, str(e))
        return {"status": draft.status, "message": str(e)}


def check_batch_status(
    db: Session,
    draft_ids: List[int],
) -> List[dict]:
    """批量查询 Ozon 导入状态"""
    results = []
    for did in draft_ids:
        try:
            r = check_draft_status(db, did)
            r["draft_id"] = did
            results.append(r)
        except Exception as e:
            results.append({"draft_id": did, "status": "error", "message": str(e)})
    return results
