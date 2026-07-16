"""
统一上架 API — 替代原来 selection.py::upload_to_store 和
precision_listing.py::submit_to_ozon 中分散的上架逻辑。

设计：
  1. 草稿 CRUD：创建 → 编辑 → 提交 → 跟踪
  2. 所有 Ozon API payload 构建在 upload_service 中完成
  3. 支持批量创建 / 批量提交 / 批量查状态
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.upload_draft import (
    CreateDraftRequest,
    BatchCreateDraftRequest,
    UpdateDraftRequest,
    SubmitDraftRequest,
    BatchSubmitRequest,
    UploadDraftRead,
    BatchSubmitResponse,
    SubmitResult,
)
from app.crud import upload_draft as draft_crud
from app.services import upload_service

router = APIRouter()
logger = logging.getLogger(__name__)


# ── 草稿 CRUD ────────────────────────────────────────────────

@router.get("/drafts", response_model=dict)
def list_drafts(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    store_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """列出上架草稿（带分页）"""
    drafts = draft_crud.get_drafts(
        db, skip=skip, limit=limit,
        store_id=store_id, status=status,
        source_type=source_type, keyword=keyword,
    )
    total = draft_crud.count_drafts(
        db, store_id=store_id, status=status,
        source_type=source_type, keyword=keyword,
    )
    return {
        "items": [UploadDraftRead.model_validate(d) for d in drafts],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/drafts/{draft_id}", response_model=UploadDraftRead)
def get_draft(draft_id: int, db: Session = Depends(get_db)):
    """获取单个草稿详情"""
    draft = draft_crud.get_draft(db, draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="草稿不存在")
    return UploadDraftRead.model_validate(draft)


@router.post("/drafts", response_model=UploadDraftRead)
def create_draft(body: CreateDraftRequest, db: Session = Depends(get_db)):
    """从采集商品创建单个上架草稿"""
    try:
        draft = upload_service.create_draft_from_scraped(
            db,
            store_id=body.store_id,
            source_product_id=body.source_product_id,
            description_category_id=body.description_category_id,
            type_id=body.type_id,
            category_name=body.category_name,
            offer_id=body.offer_id,
            name=body.name,
            price_rub=body.price_rub,
            old_price_rub=body.old_price_rub,
        )
        return UploadDraftRead.model_validate(draft)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/drafts/batch", response_model=dict)
def batch_create_drafts(body: BatchCreateDraftRequest, db: Session = Depends(get_db)):
    """批量从采集商品创建上架草稿"""
    drafts = upload_service.create_drafts_batch(
        db,
        store_id=body.store_id,
        source_product_ids=body.source_product_ids,
        description_category_id=body.description_category_id,
        type_id=body.type_id,
        offer_id_prefix=body.offer_id_prefix,
        price_rub=body.price_rub,
        old_price_rub=body.old_price_rub,
        markup_pct=body.markup_pct,
        exchange_rate=body.exchange_rate,
    )
    return {
        "success": True,
        "created": len(drafts),
        "drafts": [UploadDraftRead.model_validate(d) for d in drafts],
    }


@router.put("/drafts/{draft_id}", response_model=UploadDraftRead)
def update_draft(draft_id: int, body: UpdateDraftRequest, db: Session = Depends(get_db)):
    """更新草稿（仅传需要修改的字段）"""
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="未提供更新字段")

    draft = draft_crud.update_draft(db, draft_id, update_data)
    if not draft:
        raise HTTPException(status_code=404, detail="草稿不存在")

    # Auto-update status: if category+type filled → ready
    if draft.status == "draft" and draft.description_category_id and draft.type_id:
        draft_crud.update_draft(db, draft_id, {"status": "ready"})
        draft = draft_crud.get_draft(db, draft_id)

    return UploadDraftRead.model_validate(draft)


@router.delete("/drafts/{draft_id}")
def delete_draft(draft_id: int, db: Session = Depends(get_db)):
    """删除单个草稿"""
    ok = draft_crud.delete_draft(db, draft_id)
    if not ok:
        raise HTTPException(status_code=404, detail="草稿不存在")
    return {"success": True}


@router.post("/drafts/batch-delete")
def batch_delete_drafts(ids: List[int], db: Session = Depends(get_db)):
    """批量删除草稿"""
    deleted = draft_crud.bulk_delete_drafts(db, ids)
    return {"success": True, "deleted": deleted}


# ── 提交到 Ozon ──────────────────────────────────────────────

@router.post("/drafts/{draft_id}/submit")
def submit_draft(draft_id: int, db: Session = Depends(get_db)):
    """提交单个草稿到 Ozon"""
    try:
        result = upload_service.submit_draft_to_ozon(db, draft_id)
        if result["success"]:
            return {
                "success": True,
                "task_id": result["task_id"],
                "message": f"已提交，Ozon task_id={result['task_id']}",
            }
        else:
            raise HTTPException(status_code=400, detail=result["error"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/batch-submit", response_model=BatchSubmitResponse)
def batch_submit_drafts(body: BatchSubmitRequest, db: Session = Depends(get_db)):
    """批量提交草稿到 Ozon"""
    try:
        result = upload_service.submit_batch_to_ozon(db, body.draft_ids)
        return BatchSubmitResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 状态跟踪 ────────────────────────────────────────────────

@router.get("/drafts/{draft_id}/status")
def check_status(draft_id: int, db: Session = Depends(get_db)):
    """查询单个草稿的 Ozon 导入状态"""
    try:
        result = upload_service.check_draft_status(db, draft_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/batch-status")
def batch_check_status(draft_ids: List[int], db: Session = Depends(get_db)):
    """批量查询草稿的 Ozon 导入状态"""
    results = upload_service.check_batch_status(db, draft_ids)
    return {"results": results}
