"""Prompt Template CRUD router — manage prompt templates in DB."""
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.crud import prompt_template as pt_crud
from app.schemas.prompt_template import (
    PromptTemplateCreate,
    PromptTemplateUpdate,
    PromptTemplateRead,
)

router = APIRouter()


@router.get("", response_model=list[PromptTemplateRead])
def list_templates(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    platform: Optional[str] = None,
    language: Optional[str] = None,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    return pt_crud.get_templates(db, skip, limit, platform, language, category, is_active)


@router.get("/count")
def count_templates(
    platform: Optional[str] = None,
    language: Optional[str] = None,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    return {"total": pt_crud.count_templates(db, platform, language, category, is_active)}


@router.get("/{template_id}", response_model=PromptTemplateRead)
def get_template(template_id: int, db: Session = Depends(get_db)):
    obj = pt_crud.get_template(db, template_id)
    if not obj:
        raise HTTPException(404, "模板不存在")
    return obj


@router.post("", response_model=PromptTemplateRead, status_code=201)
def create_template(body: PromptTemplateCreate, db: Session = Depends(get_db)):
    # Check duplicate name
    existing = pt_crud.get_template_by_name(db, body.name)
    if existing:
        raise HTTPException(409, f"模板名称已存在: {body.name}")
    return pt_crud.create_template(db, body)


@router.put("/{template_id}", response_model=PromptTemplateRead)
def update_template(template_id: int, body: PromptTemplateUpdate, db: Session = Depends(get_db)):
    obj = pt_crud.update_template(db, template_id, body)
    if not obj:
        raise HTTPException(404, "模板不存在")
    return obj


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    ok = pt_crud.delete_template(db, template_id)
    if not ok:
        raise HTTPException(404, "模板不存在")
    return {"detail": "已删除"}


@router.get("/by-name/{name}", response_model=PromptTemplateRead)
def get_template_by_name(name: str, db: Session = Depends(get_db)):
    obj = pt_crud.get_template_by_name(db, name)
    if not obj:
        raise HTTPException(404, f"模板不存在: {name}")
    return obj
