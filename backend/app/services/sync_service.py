"""Sync service — pulls data from Ozon API into local database.

Each sync_* function is called by either:
  - APScheduler (scheduled task)
  - Manual trigger via API
"""

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
from app.schemas.finance import StoreFinanceUpdate
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

    Uses /v1/finance/balance for summary, /v1/finance/cash-flow-statement/list for detail.
    Returns a dict with keys: balance, total_income, total_expense, pending_amount.
    """
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    now_utc = datetime.now(timezone.utc)
    date_to = now_utc.strftime("%Y-%m-%d")
    date_from = (now_utc - timedelta(days=90)).strftime("%Y-%m-%d")

    # 1) Balance report — authoritative source for summary numbers
    balance_data = client.get_balance_report(date_from=date_from, date_to=date_to)

    # 2) Cash-flow statement — detailed records (fetch first page for record-keeping)
    client.get_finance_statement(date_from=date_from, date_to=date_to)

    update = StoreFinanceUpdate(
        balance=balance_data["closing_balance"],
        total_income=balance_data["sales_amount"],
        total_expense=balance_data["sales_fee"] + balance_data["services_cost"],
        pending_amount=balance_data["accrued"],
    )
    result = finance_crud.upsert_finance(db, store.id, update)
    logger.info("sync_finance[%s]: balance=%.2f", store.name, result.balance)
    return {
        "balance": result.balance,
        "total_income": result.total_income,
        "total_expense": result.total_expense,
        "pending_amount": result.pending_amount,
    }


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

        clear_cache()
        logger.info("run_sync_task(%s): done, processed %d stores", task_key, total)
        mark_task_run(db, task_key, "success")
        return "success"
    except Exception as e:
        logger.error("run_sync_task(%s) failed: %s", task_key, e)
        mark_task_run(db, task_key, "failed")
        return "failed"
