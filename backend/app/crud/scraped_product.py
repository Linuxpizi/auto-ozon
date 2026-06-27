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


def _is_enriched(new_val, old_val, field_type="str"):
    """判断新值是否比旧值更'丰富' —— 非空/非零/非空列表 优先"""
    if field_type == "list":
        return bool(new_val)
    if field_type == "int":
        return new_val not in (None, 0)
    if field_type == "float":
        return new_val not in (None, 0.0)
    return bool(new_val) and new_val != old_val


def bulk_create_scraped_products(
    db: Session, products: List[ScrapedProductCreate]
) -> List[ScrapedProductRecord]:
    """批量同步采集记录 —— 不存在则创建，已存在则用更丰富的字段更新（upsert）"""
    # 构建已有记录索引
    existing_map: dict[tuple[str, str], ScrapedProductRecord] = {}
    rows = db.query(ScrapedProductRecord).all()
    for row in rows:
        existing_map[(row.platform, row.source_id)] = row

    created: list[ScrapedProductRecord] = []
    updated: list[ScrapedProductRecord] = []

    for product in products:
        key = (product.platform, product.source_id)
        record = existing_map.get(key)

        if record is None:
            # ── 新记录：直接创建 ──
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
            created.append(record)
        else:
            # ── 已存在：用更丰富的字段更新 ──
            changed = False

            # 标题：新值非空时覆盖
            if product.title and product.title != record.title:
                record.title = product.title
                changed = True

            # 品牌
            if _is_enriched(product.brand, record.brand):
                record.brand = product.brand
                changed = True

            # 品类
            if _is_enriched(product.category, record.category):
                record.category = product.category
                changed = True

            # 评分
            if _is_enriched(product.rating, record.rating, "float"):
                record.rating = product.rating
                changed = True

            # 评论数
            if _is_enriched(product.review_count, record.review_count, "int"):
                record.review_count = product.review_count
                changed = True

            # 属性列表
            if _is_enriched(product.attributes, record.attributes, "list"):
                record.attributes = product.attributes
                changed = True

            # 描述
            if _is_enriched(product.description, record.description):
                record.description = product.description
                changed = True

            # 图片
            if _is_enriched(product.images, record.images, "list"):
                record.images = product.images
                changed = True

            # 价格（新价格非零时更新）
            if product.price and product.price != record.price:
                record.price = product.price
                changed = True
            if product.old_price and product.old_price != record.old_price:
                record.old_price = product.old_price
                changed = True

            # 卖家
            if _is_enriched(product.seller_name, record.seller_name):
                record.seller_name = product.seller_name
                changed = True
            if _is_enriched(product.seller_url, record.seller_url):
                record.seller_url = product.seller_url
                changed = True

            # source_url
            if product.source_url and product.source_url != record.source_url:
                record.source_url = product.source_url
                changed = True

            if changed:
                updated.append(record)

    db.commit()
    for r in created:
        db.refresh(r)
    for r in updated:
        db.refresh(r)

    return created + updated


def delete_scraped_product(db: Session, record_id: int) -> bool:
    record = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id == record_id).first()
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True
