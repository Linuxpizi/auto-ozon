import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.crud import precision_listing as pl_crud
from app.schemas.precision_listing import (
    PrecisionListingCreate, PrecisionListingUpdate, PrecisionListingRead,
    ImportBySkuRequest, SyncImportedRequest, ScrapeRequest, ScrapeResponse,
    SubmitToOzonRequest,
)
from app.core.db import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


# ── CRUD endpoints ──────────────────────────────────────────

@router.get("/", response_model=List[PrecisionListingRead])
def list_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    store_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    mode: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return pl_crud.get_tasks(db, skip=skip, limit=limit, store_id=store_id,
                             status=status, mode=mode, keyword=keyword)


@router.get("/count")
def count_tasks(
    store_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    mode: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    total = pl_crud.count_tasks(db, store_id=store_id, status=status,
                                mode=mode, keyword=keyword)
    return {"total": total}


# ── Mode B: Multi-platform scraper ────────────────────────

@router.get("/supported-platforms")
def get_supported_platforms():
    """Return the list of platforms we can scrape."""
    from app.services.scrapers.factory import supported_platforms
    return {"platforms": supported_platforms()}


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape_product_url(payload: ScrapeRequest):
    """
    Mode B: Scrape product data from an external platform URL.

    Supports: ozon.ru, 1688.com, aliexpress.com
    Returns normalised product data that the frontend can populate
    into the interactive editing form.
    """
    from app.services.scrapers.factory import scrape_product
    try:
        result = await scrape_product(payload.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Scrape failed for %s: %s", payload.url, e)
        raise HTTPException(status_code=502, detail=f"Scraping failed: {e}")

    return ScrapeResponse(
        platform=result.platform,
        source_url=result.source_url,
        source_id=result.source_id,
        title=result.title,
        description=result.description,
        images=result.images,
        price=result.price,
        currency=result.currency,
        brand=result.brand,
        category=result.category,
        weight=result.weight,
        dimensions=result.dimensions,
        min_order_qty=result.min_order_qty,
        seller_name=result.seller_name,
        extra=result.extra,
    )


@router.get("/{task_id}", response_model=PrecisionListingRead)
def get_task(task_id: int, db: Session = Depends(get_db)):
    obj = pl_crud.get_task(db, task_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Task not found")
    return obj


@router.post("/", response_model=PrecisionListingRead, status_code=201)
def create_task(data: PrecisionListingCreate, db: Session = Depends(get_db)):
    return pl_crud.create_task(db, data)


@router.put("/{task_id}", response_model=PrecisionListingRead)
def update_task(task_id: int, data: PrecisionListingUpdate, db: Session = Depends(get_db)):
    obj = pl_crud.update_task(db, task_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Task not found")
    return obj


@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    ok = pl_crud.delete_task(db, task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}


# ── Ozon import-by-sku flow ─────────────────────────────────

@router.post("/import-by-sku")
async def import_by_sku(payload: ImportBySkuRequest, db: Session = Depends(get_db)):
    """
    Phase 1: Call Ozon's /v1/product/import-by-sku to create a product card
    copy from another seller. This does NOT return source product details -
    it directly creates a copy in the user's store (async, returns task_id).

    The user must browse ozon.ru to find the SKU they want to copy,
    then provide it along with their desired offer_id and price.
    """
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    store = db.query(Store).filter(Store.id == payload.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    client = OzonClient(store.api_key, store.client_id)

    # Call /v1/product/import-by-sku
    body = {
        "items": [{
            "sku": int(payload.source_sku),
            "name": payload.source_name or f"SKU-{payload.source_sku}",
            "offer_id": payload.offer_id,
            "currency_code": payload.currency_code or "RUB",
            "old_price": payload.old_price or "0",
            "price": payload.price or "0",
            "vat": payload.vat or "0",
        }]
    }

    try:
        resp = await client._request("POST", "/v1/product/import-by-sku", body=body)
    except Exception as e:
        logger.error("import-by-sku failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Ozon API error: {e}")

    result = resp.get("result", {})
    ozon_task_id = result.get("task_id", 0)
    unmatched = result.get("unmatched_sku_list", [])

    if unmatched:
        raise HTTPException(
            status_code=400,
            detail=f"SKU {payload.source_sku} cannot be copied (seller may have disabled copying or SKU not found)",
        )

    # Create local task record
    task_data = PrecisionListingCreate(
        store_id=payload.store_id,
        store_name=store.name,
        mode="copy_ozon",
        source_sku=payload.source_sku,
        source_name=payload.source_name or f"SKU-{payload.source_sku}",
        offer_id=payload.offer_id,
        price=payload.price or "",
        old_price=payload.old_price or "",
        vat=payload.vat or "0",
        task_id=ozon_task_id,
        status="importing",  # Waiting for Ozon async processing
    )
    task = pl_crud.create_task(db, task_data)

    return {
        "task_id": task.id,
        "ozon_task_id": ozon_task_id,
        "status": "importing",
        "message": f"Import submitted. Ozon task_id={ozon_task_id}. "
                   "Click 'Sync' after a moment to fetch the imported product details.",
    }


@router.post("/{task_id}/sync")
async def sync_imported_product(task_id: int, db: Session = Depends(get_db)):
    """
    Phase 2: After import-by-sku completes, the copied product now exists in
    the user's own store. We can now query it using the standard product APIs
    because it belongs to us.

    This endpoint fetches the copied product's details and populates the task.
    """
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    task = pl_crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    store = db.query(Store).filter(Store.id == task.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    client = OzonClient(store.api_key, store.client_id)

    # Now we query OUR OWN product by offer_id (it's in our store after import)
    if not task.offer_id:
        raise HTTPException(status_code=400, detail="No offer_id set on this task")

    # 1. Get product info from our own store
    info_resp = await client._request("POST", "/v3/product/info/list", body={
        "offer_id": [task.offer_id],
        "limit": 1,
    })
    items = info_resp.get("result", {}).get("items", [])
    if not items:
        # Product may not have been created yet by Ozon async process
        return {
            "synced": False,
            "message": "Product not yet available in store. Please wait and try again.",
        }

    item = items[0]
    product_id = str(item.get("id", ""))
    actual_offer_id = item.get("offer_id", task.offer_id)

    images = item.get("images", [])
    primary_image = item.get("primary_image", "")
    if primary_image and primary_image not in images:
        images = [primary_image] + images

    source_name = item.get("name", "")

    # 3. Get description from our own store
    desc_text = ""
    try:
        desc_resp = await client._request("POST", "/v1/product/info/description", body={
            "product_id": int(product_id),
        })
        desc_text = desc_resp.get("result", {}).get("description", "")
    except Exception:
        pass

    # Update the task with fetched data
    update_data = PrecisionListingUpdate(
        source_name=source_name or task.source_name,
        source_description=desc_text,
        source_images=json.dumps(images, ensure_ascii=False),
        product_id=product_id,
        offer_id=actual_offer_id,
        status="imported",  # Ready for editing
    )
    updated = pl_crud.update_task(db, task_id, update_data)

    return {
        "synced": True,
        "message": f"Product synced: {source_name}",
        "product_id": product_id,
        "offer_id": actual_offer_id,
        "image_count": len(images),
    }


@router.get("/{task_id}/ozon-status")
async def check_ozon_import_status(task_id: int, db: Session = Depends(get_db)):
    """
    Check if the Ozon import task has completed.
    Uses /v1/product/import/info/task to check the async task status.
    """
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    task = pl_crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not task.task_id:
        return {"status": "no_task", "message": "No Ozon import task_id associated"}

    store = db.query(Store).filter(Store.id == task.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    client = OzonClient(store.api_key, store.client_id)

    try:
        resp = await client._request("POST", "/v1/product/import/info/task", body={
            "task_id": task.task_id,
        })
        result = resp.get("result", {})
        status = result.get("status", "unknown")

        return {
            "ozon_task_id": task.task_id,
            "status": status,
            "items": result.get("items", []),
        }
    except Exception as e:
        return {
            "ozon_task_id": task.task_id,
            "status": "error",
            "message": str(e),
        }


@router.post("/{task_id}/submit")
async def submit_to_ozon(
    task_id: int,
    body: SubmitToOzonRequest,
    db: Session = Depends(get_db),
):
    """
    Submit a precision listing task to Ozon as a new product.
    Uses /v3/product/import/push to create the product with translated content.
    """
    from app.models.store import Store
    from app.services.ozon_client import OzonClient

    task = pl_crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    store = db.query(Store).filter(Store.id == task.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    client = OzonClient(store.api_key, store.client_id)

    # Use translated_name or source_name
    product_name = task.translated_name or task.source_name or f"SKU-{task.source_sku}"
    description = task.translated_description or task.source_description or ""

    # Build offer_id
    offer_id = body.offer_id or task.offer_id or f"PL-{task.id}-{task.source_sku}"

    # Build price
    price_kopecks = str(int(body.price_rub * 100)) if body.price_rub else (
        str(int(float(task.price) * 100)) if task.price and float(task.price or 0) > 0 else ""
    )
    old_price_kopecks = str(int(body.old_price_rub * 100)) if body.old_price_rub else (
        str(int(float(task.old_price) * 100)) if task.old_price and float(task.old_price or 0) > 0 else ""
    )

    # Parse images
    images = []
    if task.source_images:
        try:
            images = [img for img in json.loads(task.source_images) if img and img.startswith("http")]
        except Exception:
            pass

    # Dimensions
    height = body.height_mm or task.height or 0
    depth = body.depth_mm or task.depth or 0
    width = body.width_mm or task.width or 0
    weight = body.weight_g or task.weight or 0

    # Category / type
    category_id = body.description_category_id or task.category_id or 0
    type_id = body.type_id or task.type_id or 0

    item = {
        "offer_id": offer_id,
        "name": product_name,
        "description_category_id": category_id,
        "type_id": type_id,
        "barcode": body.barcode or "",
        "dimension_unit": "mm",
        "weight_unit": "g",
        "height": height,
        "depth": depth,
        "width": width,
        "weight": weight,
        "primary_image": images[0] if images else "",
        "images": images[:15],
        "currency_code": "RUB",
        "price": price_kopecks,
        "old_price": old_price_kopecks,
        "vat": task.vat or "0",
    }

    try:
        result = await client.import_products([item])

        # Extract task_id from response
        task_data = result.get("result", {})
        ozon_task_id = 0
        if isinstance(task_data, dict):
            task_ids = task_data.get("task_id", [])
            if task_ids:
                ozon_task_id = task_ids[0] if isinstance(task_ids, list) else task_ids

        # Update task
        update_data = PrecisionListingUpdate(
            status="submitted",
            offer_id=offer_id,
            task_id=ozon_task_id,
            category_id=category_id,
            type_id=type_id,
        )
        pl_crud.update_task(db, task_id, update_data)

        return {
            "success": True,
            "result": result,
            "task_id": ozon_task_id,
            "offer_id": offer_id,
            "message": f"Product submitted to Ozon. task_id={ozon_task_id}",
        }
    except Exception as e:
        logger.error("Submit failed for precision listing %d: %s", task_id, str(e))
        update_data = PrecisionListingUpdate(
            status="error",
            error_message=str(e),
        )
        pl_crud.update_task(db, task_id, update_data)
        raise HTTPException(status_code=500, detail=f"提交失败: {str(e)}")
