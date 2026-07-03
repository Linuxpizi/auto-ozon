"""Feishu (飞书) global configuration endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.crud.feishu_config import get_feishu_config, update_feishu_config
from app.schemas.feishu_config import FeishuConfigRead, FeishuConfigUpdate
from app.models.feishu_config import FeishuConfig

router = APIRouter(tags=["Feishu Config"])


@router.get("/config", response_model=FeishuConfigRead)
def api_get_feishu_config(db: Session = Depends(get_db)):
    cfg = get_feishu_config(db)
    if not cfg:
        # Return empty default
        return FeishuConfigRead(
            id=0, app_id="", app_secret="", chat_id="", webhook_url="", enabled=1
        )
    return cfg


@router.put("/config", response_model=FeishuConfigRead)
def api_update_feishu_config(
    data: FeishuConfigUpdate,
    db: Session = Depends(get_db),
):
    cfg = get_feishu_config(db)
    if not cfg:
        # First time: create with provided data
        from app.crud.feishu_config import upsert_feishu_config
        from app.schemas.feishu_config import FeishuConfigCreate

        create_data = FeishuConfigCreate(
            app_id=data.app_id or "",
            app_secret=data.app_secret or "",
            chat_id=data.chat_id or "",
            webhook_url=data.webhook_url or "",
            enabled=data.enabled if data.enabled is not None else 1,
        )
        return upsert_feishu_config(db, create_data)
    updated = update_feishu_config(db, data)
    return updated


@router.post("/test")
def api_test_feishu_notification(
    db: Session = Depends(get_db),
):
    """Send a test notification to verify Feishu configuration."""
    cfg = get_feishu_config(db)
    if not cfg or cfg.enabled != 1:
        raise HTTPException(status_code=400, detail="飞书通知未启用或配置缺失")

    from app.services.feishu_service import notify_return_order

    test_data = {
        "return_id": "TEST-001",
        "store_name": "测试店铺",
        "product_name": "测试商品 — 飞书通知测试",
        "offer_id": "TEST-SKU",
        "quantity": 1,
        "return_price": 99.0,
        "reason": "测试退货",
        "reason_message": "这是一条测试通知，请忽略",
        "status": "pending",
        "image_url": "",
    }
    chat_id = ""
    if cfg:
        chat_id = getattr(cfg, "chat_id", "")
    ok = notify_return_order(cfg, test_data, chat_id)
    if ok:
        return {"success": True, "message": "测试通知发送成功"}
    else:
        raise HTTPException(status_code=500, detail="测试通知发送失败，请检查配置")
