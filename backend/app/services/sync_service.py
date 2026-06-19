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
from app.crud import order as order_crud
from app.crud import finance as finance_crud
from app.crud import monitor as monitor_crud
from app.schemas.order import OrderCreate
from app.schemas.finance import StoreFinanceUpdate, FinanceCashFlowBase
from app.schemas.monitor import StoreMonitorCreate
from app.crud.task_config import mark_task_run

logger = logging.getLogger(__name__)


def sync_orders_for_store(
    db: Session, store: Store, since: Optional[str] = None
) -> int:
    """Fetch FBS postings from Ozon and upsert into local orders table.

    Returns count of new orders imported.
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
            statuses=["awaiting_packaging", "awaiting_deliver", "delivering"],
            limit=100,
            cursor=cursor,
        )
        all_postings.extend(postings)
        if not has_next:
            break
    count = 0
    for p in all_postings:
        existing = order_crud.get_order_by_number(db, p.order_number)
        if existing:
            continue
        order_data = OrderCreate(
            order_number=p.order_number,
            store_id=store.id,
            store_name=store.name,
            account_name=store.account_name,
            is_quality_check=_is_quality_check(p.order_number),
            gmv=p.price * p.quantity,
            status=p.status,
            shipment_number=p.posting_number,
            sku=p.sku,
            product_name=p.product_name,
            image_url="",
            tracking_number=p.tracking_number,
            quantity=p.quantity,
            unit_price=p.price,
            must_ship_by=None,
            express_delivery=p.is_express,
        )
        order_crud.create_order(db, order_data)
        count += 1
    logger.info("sync_orders[%s]: %d new orders", store.name, count)
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
        with_details=False,
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
        update = StoreFinanceUpdate(
            opening_balance=latest_balance["opening_balance"],
            balance=latest_balance["closing_balance"],
            total_income=latest_balance["sales_amount"],
            total_expense=latest_balance["sales_fee"] + latest_balance["services_cost"],
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
    """Fetch warehouse list from Ozon.

    Currently just validates Ozon API connectivity.
    Returns count of warehouses.
    """
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    warehouses = client.get_warehouses()
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
    except Exception:
        logger.warning(
            "sync_monitors[%s]: product_stocks not available, using zeros", store.name
        )
        total_stock = 0
        active_count = 0

    snapshot = StoreMonitorCreate(
        store_id=store.id,
        store_name=store.name,
        account_name=store.account_name,
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
    """Fetch FBS seller rating index from Ozon and store as JSON on the Store."""
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    try:
        rating = client.get_seller_rating()
        payload = {
            "index": rating.index,
            "currency_code": rating.currency_code,
            "period_from": rating.period_from,
            "period_to": rating.period_to,
            "processing_costs_sum": rating.processing_costs_sum,
            "defects": rating.defects,
        }
        store.seller_rating = json.dumps(payload, ensure_ascii=False)
        db.commit()
        logger.info("sync_seller_rating[%s]: index=%.2f", store.name, rating.index)
    except Exception as e:
        logger.warning("sync_seller_rating[%s] failed: %s", store.name, e)
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
        logger.warning("sync_products[%s] failed to fetch active: %s", store.name, e)
        active_products = []

    try:
        archived_products = client.get_product_list(visibility="ARCHIVED")
    except Exception as e:
        logger.warning("sync_products[%s] failed to fetch archived: %s", store.name, e)
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
                account_name=store.account_name,
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
                account_name=store.account_name,
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
            logger.warning("sync_products[%s] failed to fetch info: %s", store.name, e)
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

        clear_cache()
        logger.info("run_sync_task(%s): done, processed %d stores", task_key, total)
        mark_task_run(db, task_key, "success")
        return "success"
    except Exception as e:
        logger.error("run_sync_task(%s) failed: %s", task_key, e)
        mark_task_run(db, task_key, "failed")
        return "failed"
