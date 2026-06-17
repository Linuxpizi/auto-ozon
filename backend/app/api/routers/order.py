from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.crud import order as order_crud
from app.schemas.order import OrderCreate, OrderUpdate, OrderRead
from app.core.db import get_db

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
    """同步 Ozon 订单（占位实现，模拟生成订单数据）"""
    import random
    from datetime import datetime, timedelta
    from app.schemas.order import OrderCreate

    stores = db.query("id, name, account_name from stores")  # not real — just placeholder
    # Use proper query
    from app.models.store import Store
    store_list = db.query(Store).limit(10).all()
    if not store_list:
        raise HTTPException(400, detail="请先添加店铺")

    statuses = ["accepted", "processing", "shipped", "delivered"]
    count = 0
    for store in store_list[:3]:
        for _ in range(random.randint(1, 5)):
            order_data = OrderCreate(
                order_number=f"SYNC-{datetime.utcnow().strftime('%y%m%d')}-{random.randint(10000, 99999)}",
                store_id=store.id,
                store_name=store.name,
                account_name=store.account_name,
                is_quality_check=random.choice([True, False]),
                gmv=round(random.uniform(100, 5000), 2),
                status=random.choice(statuses),
                shipment_number=f"SHIP-{random.randint(1000, 9999)}",
                sku=f"SKU-{random.randint(10000, 99999)}",
                product_name=f"商品-{random.choice(['A', 'B', 'C', 'D'])}-{random.randint(100, 999)}",
                image_url="",
                tracking_number=f"TRACK-{random.randint(100000, 999999)}",
                quantity=random.randint(1, 10),
                unit_price=round(random.uniform(50, 500), 2),
                must_ship_by=(datetime.utcnow() + timedelta(days=random.randint(1, 14))).isoformat() if random.random() > 0.3 else None,
                express_delivery=random.choice([True, False]),
            )
            order_crud.create_order(db, order_data)
            count += 1

    return {"count": count}
