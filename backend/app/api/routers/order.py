from typing import List, Optional
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.crud import order as order_crud
from app.schemas.order import OrderCreate, OrderUpdate, OrderRead
from app.core.db import get_db
from app.services.sync_service import run_sync_task
from app.services.ozon_client import OzonClient, clear_cache
from app.models.store import Store
from app.models.order import Order

router = APIRouter()


@router.get("/", response_model=List[OrderRead])
def list_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return order_crud.get_orders(
        db, skip=skip, limit=limit, store_id=store_id, status=status, keyword=keyword
    )


@router.get("/count")
def get_order_count(
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return {"count": order_crud.count_orders(db, store_id=store_id, status=status, keyword=keyword)}


@router.get("/export/csv")
def export_orders_csv(
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """导出当前筛选条件下的所有订单为 CSV 文件。"""
    orders = order_crud.get_orders(db, skip=0, limit=100000, store_id=store_id, status=status, keyword=keyword)

    # BOM for Excel compatibility
    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "订单号", "店铺", "货件号", "运单号", "状态", "商品名称", "SKU", "Offer ID",
        "数量", "单价", "成交价", "佣金", "折扣", "平台结算", "币种",
        "极速达", "质检", "创建日期", "要求发货日期", "取消发起方", "取消原因", "取消时间",
    ])

    for o in orders:
        writer.writerow([
            o.order_number or "",
            o.store_name or "",
            o.shipment_number or "",
            o.tracking_number or "",
            o.status or "",
            o.product_name or "",
            o.sku or "",
            o.offer_id or "",
            o.quantity or 0,
            o.unit_price or 0,
            o.customer_price or 0,
            o.commission or 0,
            o.discount or 0,
            o.payout or 0,
            o.currency_code or "",
            "是" if o.express_delivery else "",
            "是" if o.is_quality_check else "",
            o.created_at.strftime("%Y-%m-%d %H:%M") if o.created_at else "",
            o.must_ship_by.strftime("%Y-%m-%d %H:%M") if o.must_ship_by else "",
            o.cancellation_initiator or "",
            o.cancellation_reason_message or "",
            o.cancelled_at.strftime("%Y-%m-%d %H:%M") if o.cancelled_at else "",
        ])

    output.seek(0)
    filename = "orders_export.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{order_id}", response_model=OrderRead)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = order_crud.get_order(db, order_id)
    if not order:
        raise HTTPException(404, "订单不存在")
    return order


@router.post("/", response_model=OrderRead, status_code=201)
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    return order_crud.create_order(db, order)


@router.put("/{order_id}", response_model=OrderRead)
def update_order(order_id: int, order: OrderUpdate, db: Session = Depends(get_db)):
    updated = order_crud.update_order(db, order_id, order)
    if not updated:
        raise HTTPException(404, "订单不存在")
    return updated


@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    deleted = order_crud.delete_order(db, order_id)
    if not deleted:
        raise HTTPException(404, "订单不存在")
    return {"ok": True}


@router.post("/sync")
def sync_orders(db: Session = Depends(get_db)):
    """从 Ozon 同步所有店铺的 FBS 订单数据。"""
    clear_cache()
    result = run_sync_task(db, "sync_orders")
    if result == "failed":
        raise HTTPException(500, detail="订单同步失败，请检查 Ozon API 凭证和网络连接")
    return {"status": result}


class ShipRequest(BaseModel):
    posting_number: str
    product_ids: list[dict]


def get_order_by_shipment(db: Session, posting_number: str):
    return db.query(Order).filter(Order.shipment_number == posting_number).first()


@router.post("/ship")
def ship_order(req: ShipRequest, db: Session = Depends(get_db)):
    """备货（Ship）指定订单。posting_number = shipment_number (posting_number)."""
    order = get_order_by_shipment(db, req.posting_number)
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.status != "awaiting_packaging":
        raise HTTPException(400, detail="只有待包装状态的订单才能备货")
    store = db.query(Store).filter(Store.id == order.store_id).first()
    if not store:
        raise HTTPException(500, detail="关联店铺不存在")
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    packages = [{"products": req.product_ids}]
    try:
        result = client.ship_fbs_posting(req.posting_number, packages)
    except Exception as e:
        raise HTTPException(502, detail=f"Ozon API 调用失败: {e}")
    return {"result": result.get("result", []), "additional_data": result.get("additional_data", [])}


class CancelRequest(BaseModel):
    posting_number: str


@router.post("/cancel")
def cancel_order(req: CancelRequest, db: Session = Depends(get_db)):
    """取消（Cancel）指定订单。"""
    order = get_order_by_shipment(db, req.posting_number)
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.status in ("cancelled", "delivered"):
        raise HTTPException(400, detail=f"订单状态为 {order.status}，无法取消")
    store = db.query(Store).filter(Store.id == order.store_id).first()
    if not store:
        raise HTTPException(500, detail="关联店铺不存在")
    client = OzonClient(client_id=store.client_id, api_key=store.api_key)
    try:
        result = client.cancel_fbs_posting(req.posting_number)
    except Exception as e:
        raise HTTPException(502, detail=f"Ozon API 调用失败: {e}")
    order_crud.update_order(db, order.id, OrderUpdate(status="cancelled"))
    return {"ok": True, "result": result}

