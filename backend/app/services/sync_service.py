"""Sync service — pulls data from Ozon API into local database.

Each sync_* function is called by either:
  - APScheduler (scheduled task)
  - Manual trigger via API
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.services.ozon_client import OzonClient, clear_cache
from app.models.store import Store
from app.models.listing import Listing
from app.crud import order as order_crud
from app.crud import finance as finance_crud
from app.crud import monitor as monitor_crud
from app.schemas.order import OrderCreate, OrderUpdate
from app.schemas.finance import StoreFinanceUpdate, FinanceCashFlowBase
from app.schemas.monitor import StoreMonitorCreate
from app.crud.task_config import mark_task_run

logger = logging.getLogger(__name__)


def sync_orders_for_store(
    db: Session, store: Store, since: Optional[str] = None
) -> int:
    """Fetch FBS postings from Ozon and upsert into local orders table.

    Returns count of new + updated orders.
    """
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    if not since:
        since = (
            (datetime.now(timezone.utc) - timedelta(days=30))
            .isoformat()
            .replace("+00:00", "Z")
        )

    all_postings: list = []
    cursor = ""
    while True:
        postings, cursor, has_next = client.get_fbs_postings(
            cutoff_from=since,
            cutoff_to=(datetime.now(timezone.utc) + timedelta(days=5))
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            statuses=["awaiting_registration", "acceptance_in_progress", "awaiting_approve",
                      "awaiting_packaging", "awaiting_deliver", "delivering",
                      "arbitration", "client_arbitration", "driver_pickup", "not_accepted"],
            limit=100,
            cursor=cursor,
        )
        all_postings.extend(postings)
        if not has_next:
            break
    # Batch-lookup images from listings table (by offer_id, fallback to sku)
    image_map: dict[str, str] = {}
    offer_ids = {p.offer_id for p in all_postings if p.offer_id}
    sku_set = {p.sku for p in all_postings if p.sku and not p.offer_id}
    if offer_ids:
        rows = (
            db.query(Listing.offer_id, Listing.primary_image)
            .filter(Listing.store_id == store.id, Listing.offer_id.in_(offer_ids))
            .all()
        )
        image_map = {r.offer_id: r.primary_image or "" for r in rows if r.primary_image}
    if sku_set:
        rows = (
            db.query(Listing.sku, Listing.primary_image)
            .filter(Listing.store_id == store.id, Listing.sku.in_(sku_set), Listing.primary_image != "")
            .all()
        )
        for r in rows:
            image_map.setdefault(r.sku, r.primary_image or "")

    # Fallback: fetch images from Ozon API for offer_ids not found in listings
    missing_offer_ids = [
        oid for oid in offer_ids
        if oid not in image_map and oid
    ]
    if missing_offer_ids:
        try:
            api_images = client.get_images_by_offer_ids(missing_offer_ids)
            image_map.update(api_images)
            # Also cache to listings table for next time
            for oid, img_url in api_images.items():
                row = (
                    db.query(Listing)
                    .filter(Listing.store_id == store.id, Listing.offer_id == oid)
                    .first()
                )
                if row:
                    row.primary_image = img_url
                else:
                    db.add(Listing(store_id=store.id, offer_id=oid, primary_image=img_url))
            db.flush()
        except Exception as exc:
            logger.warning("sync_orders: failed to fetch images from API: %s", exc, exc_info=True)

    # Second fallback: use product_id to look up images via /v3/product/info/list
    still_missing = [p for p in all_postings if p.product_id and not image_map.get(p.offer_id, "")]
    if still_missing:
        pid_set = list({p.product_id for p in still_missing})
        try:
            pid_images = client.get_images_by_product_ids(pid_set)
            for p in still_missing:
                img = pid_images.get(p.product_id, "")
                if img:
                    image_map[p.offer_id] = img
        except Exception as exc:
            logger.warning("sync_orders: product_id image fallback failed: %s", exc, exc_info=True)

    count = 0
    for p in all_postings:
        must_ship_by = None
        if p.shipment_date:
            try:
                must_ship_by = datetime.fromisoformat(p.shipment_date.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass

        in_process_at = None
        if p.in_process_at:
            try:
                in_process_at = datetime.fromisoformat(p.in_process_at.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass

        gmv = p.customer_price if p.customer_price > 0 else p.price * p.quantity
        image_url = image_map.get(p.offer_id, "") or image_map.get(p.sku, "")
        if not image_url:
            logger.error(
                "sync_orders[%s] MISSING IMAGE: order=%s offer_id=%s product_id=%s",
                store.name, p.order_number, p.offer_id, p.product_id,
            )

        order_data = OrderCreate(
            order_number=p.order_number,
            store_id=store.id,
            store_name=store.name,
            is_quality_check=_is_quality_check(p.order_number),
            gmv=gmv,
            status=p.status,
            substatus=p.substatus,
            shipment_number=p.posting_number,
            sku=p.sku,
            offer_id=p.offer_id,
            product_id=p.product_id,
            product_name=p.product_name,
            image_url=image_url,
            tracking_number=p.tracking_number,
            quantity=p.quantity,
            unit_price=p.price,
            customer_price=p.customer_price,
            payout=p.payout,
            commission=p.commission_amount,
            discount=p.discount_value,
            must_ship_by=must_ship_by,
            in_process_at=in_process_at,
            express_delivery=p.is_express,
            available_actions=p.available_actions,
            products_json=p.products_json,
        )
        existing = order_crud.get_order_by_number(db, p.order_number)
        if existing:
            order_crud.update_order(db, existing.id, OrderUpdate(
                status=p.status,
                substatus=p.substatus,
                shipment_number=p.posting_number,
                tracking_number=p.tracking_number,
                must_ship_by=must_ship_by,
                in_process_at=in_process_at,
                customer_price=p.customer_price,
                payout=p.payout,
                commission=p.commission_amount,
                discount=p.discount_value,
                gmv=gmv,
                express_delivery=p.is_express,
                offer_id=p.offer_id,
                product_id=p.product_id,
                image_url=image_url,
                available_actions=p.available_actions,
                products_json=p.products_json,
            ))
        else:
            order_crud.create_order(db, order_data)
        count += 1
    logger.info("sync_orders[%s]: %d orders processed", store.name, count)
    return count


def sync_finance_for_store(db: Session, store: Store) -> dict:
    """Fetch finance data from Ozon and upsert into local finance table.

    Balance API limits date_from~date_to to 30 days, so we split into windows.
    Also persists cash-flow statement details.
    Returns a dict with keys: balance, total_income, total_expense, pending_amount.
    """
    from app.crud import finance as finance_crud

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    now_utc = datetime.now(timezone.utc)

    # 1) Balance report — split into 30-day windows
    latest_balance = None
    walk_from = now_utc - timedelta(days=90)
    while walk_from < now_utc:
        window_end = min(walk_from + timedelta(days=29), now_utc)
        date_from = walk_from.strftime("%Y-%m-%d")
        date_to = window_end.strftime("%Y-%m-%d")
        balance_data = client.get_balance_report(date_from=date_from, date_to=date_to)
        latest_balance = balance_data  # last window has the most current closing_balance
        walk_from = window_end + timedelta(days=1)

    # 2) Cash-flow statement — persist bi-monthly detail records
    cf_statements, _ = client.get_finance_statement(
        date_from=(now_utc - timedelta(days=90)).strftime("%Y-%m-%d"),
        date_to=now_utc.strftime("%Y-%m-%d"),
        with_details=True,
    )
    for stmt in cf_statements:
        cash_flow_data = FinanceCashFlowBase(
            store_id=store.id,
            store_name=store.name,
            period_id=stmt.period_id,
            period_begin=stmt.period_begin,
            period_end=stmt.period_end,
            orders_amount=stmt.orders_amount,
            returns_amount=stmt.returns_amount,
            commission_amount=stmt.commission_amount,
            services_amount=stmt.services_amount,
            delivery_amount=stmt.delivery_and_return_amount,
            currency_code=stmt.currency_code,
        )
        finance_crud.upsert_cash_flow(db, store.id, store.name, cash_flow_data)

    if latest_balance:
        import json as _json
        total_expense = (
            latest_balance["sales_fee"]
            + latest_balance["returns_fee"]
            + latest_balance["services_cost"]
        )
        update = StoreFinanceUpdate(
            currency_code=latest_balance["currency_code"],
            opening_balance=latest_balance["opening_balance"],
            balance=latest_balance["closing_balance"],
            total_income=latest_balance["sales_amount"],
            sales_fee=latest_balance["sales_fee"],
            sales_revenue=latest_balance["sales_revenue"],
            sales_partner=latest_balance["sales_partner"],
            returns_amount=latest_balance["returns_amount"],
            returns_fee=latest_balance["returns_fee"],
            returns_revenue=latest_balance["returns_revenue"],
            returns_partner=latest_balance["returns_partner"],
            services_cost=latest_balance["services_cost"],
            services_detail=_json.dumps(latest_balance["services_detail"], ensure_ascii=False),
            total_expense=total_expense,
            pending_amount=latest_balance["accrued"],
            paid=latest_balance["paid"],
        )
        result = finance_crud.upsert_finance(db, store.id, update, store_name=store.name)
        logger.info("sync_finance[%s]: balance=%.2f", store.name, result.balance)
        return {
            "balance": result.balance,
            "total_income": result.total_income,
            "total_expense": result.total_expense,
            "pending_amount": result.pending_amount,
        }
    return {}


def sync_warehouses_for_store(db: Session, store: Store) -> int:
    """Fetch warehouse list from Ozon and save first warehouse to store."""
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    warehouses = client.get_warehouses()
    if warehouses:
        wh = warehouses[0]
        store.warehouse_id = str(wh.warehouse_id)
        store.warehouse_status = wh.status
        db.commit()
    logger.info("sync_warehouses[%s]: %d warehouses", store.name, len(warehouses))
    return len(warehouses)


def sync_monitors_for_store(db: Session, store: Store) -> bool:
    """Fetch product/stock data from Ozon and create a daily monitor snapshot.

    Uses Ozon API v2/product/info/stocks to get per-SKU stock data,
    then aggregates into a StoreMonitor record for the current date.
    """
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    today = datetime.now(timezone.utc).date()

    # Attempt to fetch stock data; if the method isn't available, fall back
    # to a lightweight summary.  The Ozon API v3/product/info/list + stocks
    # endpoints give per-SKU stock counts.
    try:
        stock_data = client.get_product_stocks()
        total_stock = sum(s.get("present", 0) for s in stock_data)
        active_count = sum(
            1 for s in stock_data if s.get("present", 0) > 0 or s.get("reserved", 0) > 0
        )
    except Exception as e:
        logger.warning("sync_monitors[%s] failed to fetch stocks: %s", store.name, e, exc_info=True)
        total_stock = 0
        active_count = 0

    snapshot = StoreMonitorCreate(
        store_id=store.id,
        store_name=store.name,
        daily_remaining=0,
        total_remaining=total_stock,
        active_listings=active_count,
        date=today,
    )
    monitor_crud.create_monitor(db, snapshot)
    logger.info(
        "sync_monitors[%s]: total_remaining=%d active_listings=%d",
        store.name,
        total_stock,
        active_count,
    )
    return True


def sync_seller_rating_for_store(db: Session, store: Store) -> bool:
    """Fetch seller ratings from Ozon /v1/seller/info and store as JSON on the Store."""
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    try:
        rating = client.get_seller_rating()
        payload = {
            "company_name": rating.company_name,
            "currency": rating.currency,
            "ratings": rating.ratings,
        }
        store.seller_rating = json.dumps(payload, ensure_ascii=False)
        db.commit()
        logger.info("sync_seller_rating[%s]: %d ratings saved", store.name, len(rating.ratings))
    except Exception as e:
        logger.warning("sync_seller_rating[%s] failed: %s", store.name, e, exc_info=True)
    return True


def sync_products_for_store(db: Session, store: Store) -> int:
    """Sync product list from Ozon for a single store.

    Two API passes because Ozon's visibility=ALL EXCLUDES archived products:
      1. visibility=ALL  -> active products
      2. visibility=ARCHIVED -> archived products
    Products absent from both passes are also marked archived.
    """
    from app.models.listing import Listing
    from datetime import datetime as dt, timezone

    client = OzonClient(client_id=store.client_id, api_key=store.api_key)

    try:
        active_products = client.get_product_list(visibility="ALL")
    except Exception as e:
        logger.warning("sync_products[%s] failed to fetch active: %s", store.name, e, exc_info=True)
        active_products = []

    try:
        archived_products = client.get_product_list(visibility="ARCHIVED")
    except Exception as e:
        logger.warning("sync_products[%s] failed to fetch archived: %s", store.name, e, exc_info=True)
        archived_products = []

    all_product_ids = set()
    upserted = 0

    # Pass 1: upsert active products
    for p in active_products:
        product_id = p.get("product_id", "")
        all_product_ids.add(product_id)
        existing = db.query(Listing).filter(
            Listing.store_id == store.id,
            Listing.product_id == product_id,
        ).first()
        if existing:
            existing.offer_id = p.get("offer_id", "")
            existing.has_fbo_stocks = p.get("has_fbo_stocks", False)
            existing.has_fbs_stocks = p.get("has_fbs_stocks", False)
            existing.archived = False
            existing.is_discounted = p.get("is_discounted", False)
            existing.updated_at = dt.now(timezone.utc)
        else:
            db.add(Listing(
                store_id=store.id,
                store_name=store.name,
                offer_id=p.get("offer_id", ""),
                product_id=product_id,
                has_fbo_stocks=p.get("has_fbo_stocks", False),
                has_fbs_stocks=p.get("has_fbs_stocks", False),
                archived=False,
                is_discounted=p.get("is_discounted", False),
            ))
            upserted += 1

    # Pass 2: upsert archived products
    for p in archived_products:
        product_id = p.get("product_id", "")
        all_product_ids.add(product_id)
        existing = db.query(Listing).filter(
            Listing.store_id == store.id,
            Listing.product_id == product_id,
        ).first()
        if existing:
            if not existing.archived:
                existing.archived = True
                existing.updated_at = dt.now(timezone.utc)
        else:
            db.add(Listing(
                store_id=store.id,
                store_name=store.name,
                offer_id=p.get("offer_id", ""),
                product_id=product_id,
                archived=True,
            ))
            upserted += 1

    # Pass 3: products disappeared from both passes -> archived
    missing = db.query(Listing).filter(
        Listing.store_id == store.id,
        Listing.archived == False,
    ).all()
    for listing in missing:
        if listing.product_id and listing.product_id not in all_product_ids:
            listing.archived = True
            listing.updated_at = dt.now(timezone.utc)

    db.commit()

    # --- Pass 4: fetch detailed info via /v3/product/info/list ---
    all_ids = [pid for pid in all_product_ids if pid]
    if all_ids:
        try:
            info_items = client.get_product_info_list(all_ids)
        except Exception as e:
            logger.warning("sync_products[%s] failed to fetch info: %s", store.name, e, exc_info=True)
            info_items = []

        info_map = {}
        for item in info_items:
            pid = str(item.get("id", ""))
            if pid:
                info_map[pid] = item

        for listing in db.query(Listing).filter(
            Listing.store_id == store.id,
            Listing.product_id.in_(all_ids),
        ).all():
            info = info_map.get(listing.product_id)
            if not info:
                continue
            listing.sku = str(info.get("sku", "") or "")
            if not listing.sku:
                sources = info.get("sources", [])
                if sources and isinstance(sources, list):
                    listing.sku = str(sources[0].get("sku", ""))
            listing.name = info.get("name", "")
            images = info.get("primary_image", [])
            listing.primary_image = images[0] if isinstance(images, list) and images else str(images) if images else ""
            listing.price = str(info.get("price", ""))
            listing.old_price = str(info.get("old_price", ""))
            listing.vat = str(info.get("vat", ""))
        db.commit()

    logger.info(
        "sync_products[%s]: active=%d archived=%d upserted=%d",
        store.name, len(active_products), len(archived_products), upserted,
    )
    return len(active_products) + len(archived_products)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

QC_PREFIXES = ("0213", "0209", "0247", "0231")


def _is_quality_check(order_number: str) -> bool:
    return order_number.startswith(QC_PREFIXES)


# ---------------------------------------------------------------------------
# Orchestrator — runs all active tasks for all stores
# ---------------------------------------------------------------------------


def run_sync_task(db: Session, task_key: str) -> str:
    """Execute a sync task across all enabled stores.

    Returns 'success' or 'failed'.
    """
    try:
        stores = db.query(Store).filter(Store.status == "active").all()
        if not stores:
            logger.warning("run_sync_task(%s): no active stores", task_key)
            mark_task_run(db, task_key, "success")
            return "success"

        total = 0
        for store in stores:
            try:
                if task_key == "sync_orders":
                    total += sync_orders_for_store(db, store)
                elif task_key == "sync_finance":
                    sync_finance_for_store(db, store)
                    total += 1
                elif task_key == "sync_warehouses":
                    total += sync_warehouses_for_store(db, store)
                elif task_key == "sync_monitors":
                    sync_monitors_for_store(db, store)
                    total += 1
                elif task_key == "sync_seller_rating":
                    sync_seller_rating_for_store(db, store)
                    total += 1
                elif task_key == "sync_products":
                    total += sync_products_for_store(db, store)
            except Exception as e:
                logger.error(
                    "run_sync_task(%s) FAILED for store %s (id=%s): %s",
                    task_key, store.name, store.id, e, exc_info=True,
                )
                db.rollback()

        clear_cache()
        logger.info("run_sync_task(%s): done, processed %d stores", task_key, total)
        mark_task_run(db, task_key, "success")
        return "success"
    except Exception as e:
        logger.error("run_sync_task(%s) FAILED: %s", task_key, e, exc_info=True)
        try:
            mark_task_run(db, task_key, "failed")
        except Exception:
            logger.error("run_sync_task(%s): failed to mark task as failed", task_key, exc_info=True)
        return "failed"
