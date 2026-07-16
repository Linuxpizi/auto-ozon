"""Product Optimization API router — POST /api/v1/product/optimize"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.schemas.prompt_template import ProductOptimizeRequest, ProductOptimizeResponse
from app.services import prompt_engine

router = APIRouter()


@router.post("/optimize", response_model=ProductOptimizeResponse)
def optimize_product(body: ProductOptimizeRequest, db: Session = Depends(get_db)):
    """根据商品基础信息优化产品信息（淘宝/ Ozon 自动路由）"""
    try:
        return prompt_engine.optimize_product(body, db)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"产品信息优化失败: {e}")
