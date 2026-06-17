"""Sync service — pulls data from Ozon API into local database.

Each sync_* function is called by either:
  - APScheduler (scheduled task)
  - Manual trigger via API
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.services.ozon_client import OzonClient
from app.models.store import Store
from app.crud import order as order_crud
from app.crud import finance as finance_crud
from app.schemas.order import OrderCreate
from app.schemas.finance import StoreFinanceUpdate
from app.crud.task_config import mark_task_run

logger = logging.getLogger(__name__)


def sync_orders_for_store(db: Session, store: Store, since: Optional[str] = None) -> int:
    """Fetch FBS postings from Ozon and upsert into local orders table.

    Returns count of new orders imported.
    """
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    if not since:
        since = (datetime.utcnow() - timedelta(days=30)).isoformat()

    postings = client.get_fbs_postings(since=since, limit=500)
    count = 0
    for p in postings:
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
            tracking_number="",
            quantity=p.quantity,
            unit_price=p.price,
            must_ship_by=None,
            express_delivery=False,
        )
        order_crud.create_order(db, order_data)
        count += 1
    logger.info("sync_orders[%s]: %d new orders", store.name, count)
    return count


def sync_finance_for_store(db: Session, store: Store) -> dict:
    """Fetch finance statement from Ozon and upsert into local finance table.

    Returns a dict with keys: balance, total_income, total_expense, pending_amount.
    """
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    date_to = datetime.utcnow().strftime("%Y-%m-%d")
    date_from = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")

    statements = client.get_finance_statement(date_from=date_from, date_to=date_to)
    total_income = sum(s.amount for s in statements if s.amount > 0)
    total_expense = abs(sum(s.amount for s in statements if s.amount < 0))

    update = StoreFinanceUpdate(
        balance=total_income - total_expense,
        total_income=total_income,
        total_expense=total_expense,
        pending_amount=0.0,
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
        logger.info("run_sync_task(%s): done, processed %d stores", task_key, total)
        mark_task_run(db, task_key, "success")
        return "success"
    except Exception as e:
        logger.error("run_sync_task(%s) failed: %s", task_key, e)
        mark_task_run(db, task_key, "failed")
        return "failed"
