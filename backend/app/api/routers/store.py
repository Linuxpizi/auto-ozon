from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from app.crud import store as store_crud
from app.schemas.store import StoreCreate, StoreUpdate, StoreRead
from app.core.db import get_db

router = APIRouter()


@router.get("/", response_model=List[StoreRead])
def list_stores(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
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
        "account_name": "account_name", "所属账号": "account_name",
        "name": "name", "店铺名称": "name",
        "client_id": "client_id", "client id": "client_id",
        "api_key": "api_key", "api key": "api_key",
        "warehouse_id": "warehouse_id", "仓库 id": "warehouse_id",
        "warehouse_status": "warehouse_status", "仓库状态": "warehouse_status",
        "type_id": "type_id", "类型 id": "type_id",
        "status": "status", "状态": "status",
        "listing_status": "listing_status", "刊登状态": "listing_status",
    }

    col_idx = {}
    for i, h in enumerate(headers):
        h_key = h.lower().replace(" ", "_")
        if h in field_map:
            col_idx[field_map[h]] = i
        elif h_key in field_map:
            col_idx[field_map[h_key]] = i

    required = ["client_id", "name"]
    for r in required:
        if r not in col_idx:
            raise HTTPException(400, detail=f"缺少必要列: {r}")

    imported = 0
    for row in rows[1:]:
        values = list(row)
        client_id = str(values[col_idx["client_id"]]).strip() if col_idx["client_id"] < len(values) else ""
        name = str(values[col_idx["name"]]).strip() if col_idx["name"] < len(values) else ""
        if not client_id or not name:
            continue

        # Check duplicate
        existing = store_crud.get_store_by_client_id(db, client_id)
        if existing:
            continue

        data = StoreCreate(
            account_name=str(values[col_idx["account_name"]]).strip() if "account_name" in col_idx and col_idx["account_name"] < len(values) else "",
            name=name,
            client_id=client_id,
            api_key=str(values[col_idx["api_key"]]).strip() if "api_key" in col_idx and col_idx["api_key"] < len(values) else "",
            warehouse_id=str(values[col_idx["warehouse_id"]]).strip() if "warehouse_id" in col_idx and col_idx["warehouse_id"] < len(values) else "",
            warehouse_status=str(values[col_idx["warehouse_status"]]).strip() if "warehouse_status" in col_idx and col_idx["warehouse_status"] < len(values) else "active",
            type_id=str(values[col_idx["type_id"]]).strip() if "type_id" in col_idx and col_idx["type_id"] < len(values) else "",
            status=str(values[col_idx["status"]]).strip() if "status" in col_idx and col_idx["status"] < len(values) else "active",
            listing_status=str(values[col_idx["listing_status"]]).strip() if "listing_status" in col_idx and col_idx["listing_status"] < len(values) else "inactive",
        )
        store_crud.create_store(db, data)
        imported += 1

    wb.close()
    return {"count": imported}
