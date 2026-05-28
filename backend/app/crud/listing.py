from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.listing import Listing
from app.models.store import Store
from app.schemas.listing import ListingCreate, ListingUpdate


def get_listings(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
) -> List[Listing]:
    query = db.query(Listing)
    if store_id is not None:
        query = query.filter(Listing.store_id == store_id)
    if status:
        query = query.filter(Listing.status == status)
    if keyword:
        query = query.filter(
            Listing.sku.ilike(f"%{keyword}%")
            | Listing.product_name.ilike(f"%{keyword}%")
        )
    return query.order_by(Listing.updated_at.desc()).offset(skip).limit(limit).all()


def count_listings(
    db: Session,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
) -> int:
    query = db.query(Listing)
    if store_id is not None:
        query = query.filter(Listing.store_id == store_id)
    if status:
        query = query.filter(Listing.status == status)
    if keyword:
        query = query.filter(
            Listing.sku.ilike(f"%{keyword}%")
            | Listing.product_name.ilike(f"%{keyword}%")
        )
    return query.count()


def get_listing(db: Session, listing_id: int) -> Optional[Listing]:
    return db.query(Listing).filter(Listing.id == listing_id).first()


def create_listing(db: Session, data: ListingCreate) -> Listing:
    store = db.query(Store).filter(Store.id == data.store_id).first()
    obj = Listing(
        store_id=data.store_id,
        store_name=store.name if store else "",
        account_name=store.account_name if store else "",
        sku=data.sku,
        product_name=data.product_name,
        price=data.price,
        status=data.status,
        image_url=data.image_url,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_listing(db: Session, listing_id: int, data: ListingUpdate) -> Optional[Listing]:
    obj = db.query(Listing).filter(Listing.id == listing_id).first()
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_listing(db: Session, listing_id: int) -> bool:
    obj = db.query(Listing).filter(Listing.id == listing_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True
