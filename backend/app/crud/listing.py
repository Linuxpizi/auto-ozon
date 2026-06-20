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
    archived: Optional[bool] = None,
    keyword: Optional[str] = None,
) -> List[Listing]:
    query = db.query(Listing)
    if store_id is not None:
        query = query.filter(Listing.store_id == store_id)
    if archived is not None:
        query = query.filter(Listing.archived == archived)
    if keyword:
        query = query.filter(
            Listing.offer_id.ilike(f"%{keyword}%")
            | Listing.product_id.ilike(f"%{keyword}%")
        )
    return query.order_by(Listing.updated_at.desc()).offset(skip).limit(limit).all()


def count_listings(
    db: Session,
    store_id: Optional[int] = None,
    archived: Optional[bool] = None,
    keyword: Optional[str] = None,
) -> int:
    query = db.query(Listing)
    if store_id is not None:
        query = query.filter(Listing.store_id == store_id)
    if archived is not None:
        query = query.filter(Listing.archived == archived)
    if keyword:
        query = query.filter(
            Listing.offer_id.ilike(f"%{keyword}%")
            | Listing.product_id.ilike(f"%{keyword}%")
        )
    return query.count()


def get_listing(db: Session, listing_id: int) -> Optional[Listing]:
    return db.query(Listing).filter(Listing.id == listing_id).first()


def create_listing(db: Session, data: ListingCreate) -> Listing:
    store = db.query(Store).filter(Store.id == data.store_id).first()
    obj = Listing(
        store_id=data.store_id,
        store_name=store.name if store else "",
        offer_id=data.offer_id,
        product_id=data.product_id,
        has_fbo_stocks=data.has_fbo_stocks,
        has_fbs_stocks=data.has_fbs_stocks,
        archived=data.archived,
        is_discounted=data.is_discounted,
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


def archive_listing(db: Session, listing_id: int) -> bool:
    """Archive a single listing by setting archived=True."""
    obj = db.query(Listing).filter(Listing.id == listing_id).first()
    if not obj:
        return False
    obj.archived = True
    db.commit()
    return True


def archive_listings_bulk(db: Session, listing_ids: list[int]) -> int:
    """Archive multiple listings by ids."""
    updated = db.query(Listing).filter(Listing.id.in_(listing_ids)).update(
        {"archived": True}, synchronize_session=False
    )
    db.commit()
    return updated


def get_listing_by_offer(db: Session, store_id: int, offer_id: str) -> Optional[Listing]:
    return db.query(Listing).filter(
        Listing.store_id == store_id, Listing.offer_id == offer_id
    ).first()
