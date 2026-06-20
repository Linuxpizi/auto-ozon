from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.crud import listing as listing_crud
from app.schemas.listing import ListingCreate, ListingUpdate, ListingRead
from app.core.db import get_db
from app.services.ozon_client import OzonClient

router = APIRouter()


@router.get("/", response_model=List[ListingRead])
def list_listings(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    store_id: Optional[int] = Query(None),
    archived: Optional[bool] = Query(None),
    keyword: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return listing_crud.get_listings(db, skip=skip, limit=limit, store_id=store_id, archived=archived, keyword=keyword)


@router.get("/count")
def count_listings(
    store_id: Optional[int] = Query(None),
    archived: Optional[bool] = Query(None),
    keyword: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    total = listing_crud.count_listings(db, store_id=store_id, archived=archived, keyword=keyword)
    return {"total": total}


@router.get("/{listing_id}", response_model=ListingRead)
def get_listing(listing_id: int, db: Session = Depends(get_db)):
    obj = listing_crud.get_listing(db, listing_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Listing not found")
    return obj


@router.post("/", response_model=ListingRead, status_code=201)
def create_listing(data: ListingCreate, db: Session = Depends(get_db)):
    return listing_crud.create_listing(db, data)


@router.put("/{listing_id}", response_model=ListingRead)
def update_listing(listing_id: int, data: ListingUpdate, db: Session = Depends(get_db)):
    obj = listing_crud.update_listing(db, listing_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Listing not found")
    return obj


@router.delete("/{listing_id}")
def delete_listing(listing_id: int, db: Session = Depends(get_db)):
    ok = listing_crud.delete_listing(db, listing_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"ok": True}


@router.post("/archive")
def archive_listings(listing_ids: List[int], db: Session = Depends(get_db)):
    count = listing_crud.archive_listings_bulk(db, listing_ids)
    return {"archived": count}


@router.post("/archive/ozon")
def archive_on_ozon(listing_ids: List[int], db: Session = Depends(get_db)):
    """Archive products on Ozon platform (using product_id)."""
    listings = db.query(listing_crud.Listing).filter(
        listing_crud.Listing.id.in_(listing_ids)
    ).all()
    if not listings:
        raise HTTPException(status_code=404, detail="No listings found")

    from app.models.store import Store
    results = {}
    for listing in listings:
        if listing.store_id not in results:
            store = db.query(Store).filter(Store.id == listing.store_id).first()
            if not store:
                continue
            results[listing.store_id] = {"client": OzonClient(store.client_id, store.api_key), "product_ids": []}
        if listing.product_id:
            results[listing.store_id]["product_ids"].append(int(listing.product_id))

    archived_count = 0
    for store_id, info in results.items():
        if info["product_ids"]:
            ok = info["client"].archive_product(info["product_ids"])
            if ok:
                archived_count += len(info["product_ids"])

    listing_crud.archive_listings_bulk(db, listing_ids)
    return {"archived_on_ozon": archived_count}


@router.post("/stock")
def update_stock(
    listing_id: int,
    stock: int,
    db: Session = Depends(get_db),
):
    listing = db.query(listing_crud.Listing).filter(listing_crud.Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if not listing.product_id:
        raise HTTPException(status_code=400, detail="Product ID is empty")

    from app.models.store import Store
    store = db.query(Store).filter(Store.id == listing.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    client = OzonClient(store.client_id, store.api_key)
    warehouse_id = int(store.warehouse_id) if store.warehouse_id else 0
    result = client.update_stocks([
        {"product_id": int(listing.product_id), "stock": stock, "warehouse_id": warehouse_id}
    ])
    return result


@router.post("/import")
def import_products(
    listing_ids: List[int],
    db: Session = Depends(get_db),
):
    """Import/migrate products between warehouses on Ozon."""
    listings = db.query(listing_crud.Listing).filter(
        listing_crud.Listing.id.in_(listing_ids)
    ).all()
    if not listings:
        raise HTTPException(status_code=404, detail="No listings found")

    from app.models.store import Store
    store_cache = {}
    imported_count = 0
    for listing in listings:
        if listing.store_id not in store_cache:
            store = db.query(Store).filter(Store.id == listing.store_id).first()
            if not store:
                continue
            store_cache[listing.store_id] = OzonClient(store.client_id, store.api_key)

        if listing.product_id and listing.offer_id:
            client = store_cache[listing.store_id]
            client.import_products_by_sku([{
                "offer_id": listing.offer_id,
                "product_id": int(listing.product_id),
            }])
            imported_count += 1

    return {"imported": imported_count}
