"""Title Optimization API router — POST /api/v1/title/optimize"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.schemas.prompt_template import TitleOptimizeRequest, TitleOptimizeResponse
from app.services import prompt_engine

router = APIRouter()


@router.post("/optimize", response_model=TitleOptimizeResponse)
def optimize_title(body: TitleOptimizeRequest, db: Session = Depends(get_db)):
    """根据商品基础信息优化标题（淘宝/ Ozon 自动路由）"""
    try:
        return prompt_engine.optimize_title(body, db)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"标题优化失败: {e}")
