from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.crud import store as store_crud
from app.schemas.store import StoreCreate, StoreUpdate, StoreRead
from app.core.db import get_db

router = APIRouter()


@router.get("/", response_model=List[StoreRead])
def list_stores(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=999),
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return store_crud.get_stores(db, skip=skip, limit=limit, keyword=keyword)


@router.get("/count")
def get_store_count(
    keyword: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return {"count": store_crud.count_stores(db, keyword=keyword)}


@router.get("/{store_id}", response_model=StoreRead)
def get_store(store_id: int, db: Session = Depends(get_db)):
    store = store_crud.get_store(db, store_id)
    if not store:
        raise HTTPException(404, "店铺不存在")
    return store


@router.post("/", response_model=StoreRead, status_code=201)
def create_store(store: StoreCreate, db: Session = Depends(get_db)):
    existing = store_crud.get_store_by_client_id(db, store.client_id)
    if existing:
        raise HTTPException(400, detail="client_id 已存在")
    return store_crud.create_store(db, store)


@router.put("/{store_id}", response_model=StoreRead)
def update_store(store_id: int, store: StoreUpdate, db: Session = Depends(get_db)):
    updated = store_crud.update_store(db, store_id, store)
    if not updated:
        raise HTTPException(404, "店铺不存在")
    return updated


@router.delete("/{store_id}")
def delete_store(store_id: int, db: Session = Depends(get_db)):
    deleted = store_crud.delete_store(db, store_id)
    if not deleted:
        raise HTTPException(404, "店铺不存在")
    return {"ok": True}


@router.post("/{store_id}/sync")
def sync_store(store_id: int, db: Session = Depends(get_db)):
    """Sync seller rating + warehouse info for a single store."""
    store = store_crud.get_store(db, store_id)
    if not store:
        raise HTTPException(404, "店铺不存在")

    from app.services.ozon_client import clear_cache
    from app.services.sync_service import (
        sync_seller_rating_for_store,
        sync_warehouses_for_store,
    )
    clear_cache()
    sync_seller_rating_for_store(db, store)
    sync_warehouses_for_store(db, store)
    from app.services.sync_service import sync_fbs_error_index_for_store
    sync_fbs_error_index_for_store(db, store)
    db.refresh(store)
    return store_crud.get_store(db, store_id)


@router.post("/import", status_code=201)
def import_stores(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import stores from Excel (.xlsx) file."""
    import openpyxl
    import io

    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, detail="仅支持 .xlsx 或 .xls 文件")

    contents = file.file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents))
    ws = wb.active
    if not ws:
        raise HTTPException(400, detail="工作簿为空")

    # Map header row to field names
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        raise HTTPException(400, detail="文件缺少数据行")

    headers = [str(c).strip() for c in rows[0]]
    field_map = {
        "name": "name", "店铺名称": "name",
        "client_id": "client_id", "client id": "client_id",
        "api_key": "api_key", "api key": "api_key",
        "warehouse_id": "warehouse_id", "仓库id": "warehouse_id",
        "warehouse_status": "warehouse_status", "仓库状态": "warehouse_status",
        "type_id": "type_id", "类型id": "type_id",
        "status": "status", "状态": "status",
        "listing_status": "listing_status", "刊登状态": "listing_status",
        "contract_currency": "contract_currency", "合同货币": "contract_currency",
        "vat_rate": "vat_rate", "vat税率": "vat_rate", "vat 税率": "vat_rate",
        "auto_ad": "auto_ad", "自动广告": "auto_ad",
        "auto_archive": "auto_archive", "自动归档": "auto_archive",
        "auto_delete": "auto_delete", "自动删除": "auto_delete",
        "notes": "notes", "备注": "notes",
    }

    col_idx = {}
    for i, h in enumerate(headers):
        h_key = h.lower().replace(" ", "_").replace(" ", "_")
        if h in field_map:
            col_idx[field_map[h]] = i
        elif h_key in field_map:
            col_idx[field_map[h_key]] = i

    required = ["client_id", "name"]
    for r in required:
        if r not in col_idx:
            raise HTTPException(400, detail=f"缺少必要列: {r}")

    imported = 0
    errors = []
    for row_idx, row in enumerate(rows[1:], start=2):
        values = list(row)
        try:
            client_id = str(values[col_idx["client_id"]]).strip() if col_idx["client_id"] < len(values) else ""
            name = str(values[col_idx["name"]]).strip() if col_idx["name"] < len(values) else ""
            if not client_id or not name:
                continue

            # Check duplicate
            existing = store_crud.get_store_by_client_id(db, client_id)
            if existing:
                continue

            def s(field: str) -> str:
                return str(values[col_idx[field]]).strip() if field in col_idx and col_idx[field] < len(values) else ""

            def b(field: str) -> bool:
                v = s(field).lower()
                return v in ("true", "1", "yes", "是", "✔")

            def f(field: str) -> float:
                    v = s(field).replace("%", "")
                    if not v:
                        return 0.0
                    try:
                        return float(v)
                    except ValueError:
                        return 0.0

            data = StoreCreate(
                name=name,
                client_id=client_id,
                api_key=s("api_key"),
                warehouse_id=s("warehouse_id"),
                warehouse_status=s("warehouse_status") or "active",
                type_id=s("type_id"),
                status=s("status") or "active",
                listing_status=s("listing_status") or "inactive",
                contract_currency=s("contract_currency"),
                vat_rate=f("vat_rate"),
                auto_ad=b("auto_ad"),
                auto_archive=b("auto_archive"),
                auto_delete=b("auto_delete"),
                notes=s("notes"),
            )
            store_crud.create_store(db, data)
            imported += 1
        except Exception as e:
            errors.append(f"第 {row_idx} 行: {e}")
            continue

    wb.close()
    result = {"count": imported}
    if errors:
        result["errors"] = errors
    return result


@router.get("/import/template")
def download_import_template():
    """Download Excel template for importing stores."""
    import os
    from pathlib import Path
    from fastapi.responses import FileResponse

    template_path = Path(__file__).resolve().parent.parent.parent.parent / "static" / "template.xlsx"
    if not template_path.exists():
        raise HTTPException(404, detail="模板文件不存在")

    return FileResponse(
        path=str(template_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="store_import_template.xlsx",
        headers={
            "Content-Disposition":
                "attachment; filename*=UTF-8''store_import_template.xlsx",
        },
    )

