from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.scraped_product import ScrapedProductRecord
from app.schemas.scraped_product import ScrapedProductCreate


def get_scraped_product(db: Session, record_id: int):
    return db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == record_id).first()


def get_scraped_products(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    platform: Optional[str] = None,
) -> List[ScrapedProductRecord]:
    q = db.query(ScrapedProductRecord)
    if platform:
        q = q.filter(ScrapedProductRecord.platform == platform)
    return q.order_by(ScrapedProductRecord.created_at.desc()).offset(skip).limit(limit).all()


def count_scraped_products(db: Session, platform: Optional[str] = None) -> int:
    q = db.query(func.count(ScrapedProductRecord.id))
    if platform:
        q = q.filter(ScrapedProductRecord.platform == platform)
    return q.scalar() or 0


def create_scraped_product(db: Session, product: ScrapedProductCreate) -> ScrapedProductRecord:
    """创建一条采集记录"""
    record = ScrapedProductRecord(
        platform=product.platform,
        source_id=product.source_id,
        title=product.title,
        price=product.price,
        old_price=product.old_price,
        images=product.images,
        rating=product.rating,
        review_count=product.review_count,
        brand=product.brand,
        category=product.category,
        seller_name=product.seller_name,
        seller_url=product.seller_url,
        attributes=product.attributes,
        description=product.description,
        source_url=product.source_url,
        scraped_at=product.scraped_at,
        synced=True,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def bulk_create_scraped_products(
    db: Session, products: List[ScrapedProductCreate]
) -> List[ScrapedProductRecord]:
    """批量创建采集记录，跳过已存在的 (platform + source_id)"""
    existing = set()
    rows = db.query(ScrapedProductRecord.platform, ScrapedProductRecord.source_id).all()
    for platform, source_id in rows:
        existing.add((platform, source_id))

    created = []
    for product in products:
        key = (product.platform, product.source_id)
        if key in existing:
            continue
        record = ScrapedProductRecord(
            platform=product.platform,
            source_id=product.source_id,
            title=product.title,
            price=product.price,
            old_price=product.old_price,
            images=product.images,
            rating=product.rating,
            review_count=product.review_count,
            brand=product.brand,
            category=product.category,
            seller_name=product.seller_name,
            seller_url=product.seller_url,
            attributes=product.attributes,
            description=product.description,
            source_url=product.source_url,
            scraped_at=product.scraped_at,
            synced=True,
        )
        db.add(record)
        existing.add(key)
        created.append(record)

    db.commit()
    for r in created:
        db.refresh(r)
    return created


def delete_scraped_product(db: Session, record_id: int) -> bool:
    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == record_id).first()
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True
