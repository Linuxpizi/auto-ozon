from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.crud import order as order_crud

router = APIRouter()


@router.get("/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    total_orders = order_crud.count_orders(db)
    quality_check_orders = order_crud.count_quality_check_orders(db)
    total_gmv = order_crud.total_gmv(db)
    quality_check_gmv = order_crud.total_gmv_by_quality(db)
    return {
        "total_orders": total_orders,
        "quality_check_orders": quality_check_orders,
        "real_orders": total_orders - quality_check_orders,
        "total_gmv": round(total_gmv, 2),
        "quality_check_gmv": round(quality_check_gmv, 2),
        "real_gmv": round(total_gmv - quality_check_gmv, 2),
    }
