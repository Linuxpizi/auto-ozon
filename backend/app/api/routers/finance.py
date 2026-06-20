from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.crud import finance as finance_crud
from app.schemas.finance import StoreFinanceCreate, StoreFinanceUpdate, StoreFinanceRead, FinanceCashFlowRead
from app.core.db import get_db
from app.services.sync_service import run_sync_task
from app.services.ozon_client import clear_cache
from app.models.finance import StoreFinance, FinanceCashFlow

router = APIRouter()


# --- Static-path routes first (before /{finance_id}) ---

@router.get("/cashflows", response_model=List[FinanceCashFlowRead])
def list_cash_flows(
    store_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    return finance_crud.list_cash_flows(db, store_id=store_id, limit=limit)


@router.get("/summary")
def finance_summary(
    store_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Return aggregated totals across all stores."""
    q = db.query(
        func.sum(StoreFinance.balance).label("balance"),
        func.sum(StoreFinance.total_income).label("income"),
        func.sum(StoreFinance.sales_fee).label("sales_fee"),
        func.sum(StoreFinance.sales_revenue).label("sales_revenue"),
        func.sum(StoreFinance.returns_amount).label("returns_amount"),
        func.sum(StoreFinance.returns_fee).label("returns_fee"),
        func.sum(StoreFinance.services_cost).label("services_cost"),
        func.sum(StoreFinance.total_expense).label("expense"),
        func.sum(StoreFinance.paid).label("paid"),
        func.sum(StoreFinance.pending_amount).label("pending"),
        func.sum(StoreFinance.opening_balance).label("opening"),
    )
    if store_id is not None:
        q = q.filter(StoreFinance.store_id == store_id)
    row = q.one()
    return {
        "balance": round(float(row.balance or 0), 2),
        "income": round(float(row.income or 0), 2),
        "sales_fee": round(float(row.sales_fee or 0), 2),
        "sales_revenue": round(float(row.sales_revenue or 0), 2),
        "returns_amount": round(float(row.returns_amount or 0), 2),
        "returns_fee": round(float(row.returns_fee or 0), 2),
        "services_cost": round(float(row.services_cost or 0), 2),
        "expense": round(float(row.expense or 0), 2),
        "paid": round(float(row.paid or 0), 2),
        "pending": round(float(row.pending or 0), 2),
        "opening": round(float(row.opening or 0), 2),
    }


@router.get("/cashflow-summary")
def cashflow_summary(
    store_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Return aggregated totals for cash-flow statements."""
    q = db.query(
        func.sum(FinanceCashFlow.orders_amount).label("orders"),
        func.sum(FinanceCashFlow.returns_amount).label("returns"),
        func.sum(FinanceCashFlow.commission_amount).label("commission"),
        func.sum(FinanceCashFlow.services_amount).label("services"),
        func.sum(FinanceCashFlow.delivery_amount).label("delivery"),
        func.count(FinanceCashFlow.id).label("period_count"),
    )
    if store_id is not None:
        q = q.filter(FinanceCashFlow.store_id == store_id)
    row = q.one()
    return {
        "orders": round(float(row.orders or 0), 2),
        "returns": round(float(row.returns or 0), 2),
        "commission": round(float(row.commission or 0), 2),
        "services": round(float(row.services or 0), 2),
        "delivery": round(float(row.delivery or 0), 2),
        "period_count": int(row.period_count or 0),
    }


@router.post("/sync")
def sync_all_finances(db: Session = Depends(get_db)):
    """从 Ozon 同步所有店铺的资金流水数据。"""
    clear_cache()
    result = run_sync_task(db, "sync_finance")
    if result == "failed":
        raise HTTPException(500, detail="资金同步失败，请检查 Ozon API 凭证和网络连接")
    return {"status": result}


# --- Parameterized routes last ---

@router.get("/", response_model=List[StoreFinanceRead])
def list_finances(
    store_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return finance_crud.list_finances(db, store_id=store_id)


@router.get("/{finance_id}", response_model=StoreFinanceRead)
def get_finance(finance_id: int, db: Session = Depends(get_db)):
    obj = finance_crud.get_finance(db, finance_id)
    if not obj:
        raise HTTPException(404, "资金记录不存在")
    return obj


@router.post("/", response_model=StoreFinanceRead, status_code=201)
def create_finance(data: StoreFinanceCreate, db: Session = Depends(get_db)):
    existing = finance_crud.get_finance_by_store(db, data.store_id)
    if existing:
        raise HTTPException(400, detail="该店铺已存在资金记录")
    return finance_crud.create_finance(db, data)


@router.put("/{finance_id}", response_model=StoreFinanceRead)
def update_finance(finance_id: int, data: StoreFinanceUpdate, db: Session = Depends(get_db)):
    obj = finance_crud.update_finance(db, finance_id, data)
    if not obj:
        raise HTTPException(404, "资金记录不存在")
    return obj


@router.put("/store/{store_id}/sync", response_model=StoreFinanceRead)
def sync_finance(store_id: int, data: StoreFinanceUpdate, db: Session = Depends(get_db)):
    """Upsert finance data for a store (sync from Ozon)."""
    return finance_crud.upsert_finance(db, store_id, data)


@router.delete("/{finance_id}")
def delete_finance(finance_id: int, db: Session = Depends(get_db)):
    ok = finance_crud.delete_finance(db, finance_id)
    if not ok:
        raise HTTPException(404, "资金记录不存在")
    return {"ok": True}
