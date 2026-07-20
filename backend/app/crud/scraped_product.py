import json
from typing import Any, List, Optional
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
        currency=product.currency or ("CNY" if product.platform == "1688" else "RUB"),
        images=product.images,
        rating=product.rating,
        review_count=product.review_count,
        brand=product.brand,
        category=product.category,
        seller_name=product.seller_name,
        seller_url=product.seller_url,
        discount=product.discount,
        stock=product.stock,
        description=product.description,
        source_url=product.source_url,
        scraped_at=product.scraped_at,
        video_urls=product.video_urls,
        sku_list=product.sku_list,
        variants=product.variants,
        spec_list=product.spec_list,
        facts=product.facts,
        color_list=product.color_list,
        ozon_category_id=product.ozon_category_id,
        ozon_type_id=product.ozon_type_id,
        ozon_metrics=product.ozon_metrics,
        price_ranges=product.price_ranges,
        min_order_qty=product.min_order_qty,
        supplier_url=product.supplier_url,
        trade_quantity=product.trade_quantity,
        synced=True,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _is_enriched(new_val, old_val, field_type="str"):
    """判断新值是否比旧值更'丰富' —— 非空/非零/非空列表 优先。
    对列表类型：只在新列表长度 >= 旧列表长度时才认为更丰富，防止列表页的
    单张图片覆盖详情页采集的多张图片。"""
    if field_type == "list":
        old_len = len(old_val) if old_val else 0
        return bool(new_val) and len(new_val) >= old_len
    if field_type == "int":
        return new_val not in (None, 0)
    if field_type == "float":
        return new_val not in (None, 0.0)
    return bool(new_val) and new_val != old_val


def _as_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (TypeError, ValueError):
            return []
    return []


def _merge_unique_strings(old_value: Any, new_value: Any) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for value in _as_list(old_value) + _as_list(new_value):
        if not isinstance(value, str) or not value.strip():
            continue
        normalized = value.strip()
        key = normalized.casefold()
        if key not in seen:
            seen.add(key)
            merged.append(normalized)
    return merged


def _merge_facts(old_value: Any, new_value: Any) -> list[dict]:
    merged: list[dict] = []
    by_key: dict[tuple[str, str], dict] = {}
    for fact in _as_list(old_value) + _as_list(new_value):
        if not isinstance(fact, dict):
            continue
        name = str(fact.get("name") or "").strip()
        value = str(fact.get("value") or "").strip()
        if not name or not value:
            continue
        key = (name.casefold(), value.casefold())
        existing = by_key.get(key)
        source_path = fact.get("sourcePath") or fact.get("source_path")
        if existing is not None:
            if source_path and not existing.get("sourcePath"):
                existing["sourcePath"] = source_path
            continue
        normalized = {"name": name, "value": value}
        if source_path:
            normalized["sourcePath"] = source_path
        by_key[key] = normalized
        merged.append(normalized)
    return merged


def _merge_variants(old_value: Any, new_value: Any) -> list[dict]:
    merged: list[dict] = []
    index_by_sku: dict[str, int] = {}
    for variant in _as_list(old_value) + _as_list(new_value):
        if not isinstance(variant, dict):
            continue
        sku = str(variant.get("sku") or "").strip()
        if not sku:
            continue
        existing_index = index_by_sku.get(sku)
        if existing_index is None:
            index_by_sku[sku] = len(merged)
            normalized = {**variant, "sku": sku}
            normalized["values"] = _merge_variant_values([], variant.get("values"))
            merged.append(normalized)
            continue
        existing = merged[existing_index]
        # 新一轮采集中的显式非空字段可以更新旧事实（例如 SKU 最新价格/库存），
        # 缺失或空字段不会清除已有值；所有操作都严格限制在同一个 SKU 内。
        enriched = {**existing}
        for field, value in variant.items():
            if field in ("sku", "values"):
                continue
            if value is not None and value != "" and value != [] and value != {}:
                enriched[field] = value
        enriched["values"] = _merge_variant_values(existing.get("values"), variant.get("values"))
        merged[existing_index] = enriched
    return merged


def _merge_variant_values(old_value: Any, new_value: Any) -> list[dict]:
    merged: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for item in _as_list(old_value) + _as_list(new_value):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        value = str(item.get("value") or "").strip()
        if not name or not value:
            continue
        key = (name.casefold(), value.casefold())
        if key in seen:
            continue
        seen.add(key)
        merged.append({"name": name, "value": value})
    return merged


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
                currency=product.currency or ("CNY" if product.platform == "1688" else "RUB"),
                images=product.images,
                rating=product.rating,
                review_count=product.review_count,
                brand=product.brand,
                category=product.category,
                discount=product.discount,
                stock=product.stock,
                seller_name=product.seller_name,
                seller_url=product.seller_url,
                description=product.description,
                source_url=product.source_url,
                scraped_at=product.scraped_at,
                video_urls=product.video_urls,
                sku_list=product.sku_list,
                variants=product.variants,
                spec_list=product.spec_list,
                facts=product.facts,
                color_list=product.color_list,
                ozon_category_id=product.ozon_category_id,
                ozon_type_id=product.ozon_type_id,
                ozon_metrics=product.ozon_metrics,
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

            # 币种
            if product.currency and product.currency != record.currency:
                record.currency = product.currency
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

            # ── 补全字段（新值非空时更新） ──
            for field in ('discount', 'stock', 'brand', 'category', 'description'):
                new_val = getattr(product, field)
                if new_val and new_val != getattr(record, field):
                    setattr(record, field, new_val)
                    changed = True

            # JSON 数组字段: 新值非空时更新(合并去重)
            for field in ('video_urls', 'sku_list', 'spec_list'):
                new_val = getattr(product, field)
                if new_val:
                    old_val = getattr(record, field) or []
                    old_val = _as_list(old_val)
                    if not old_val:
                        setattr(record, field, new_val)
                        changed = True
                    elif isinstance(new_val, list) and isinstance(old_val, list):
                        # 对于简单列表(video_urls), 去重合并
                        if new_val and isinstance(new_val[0], str):
                            merged = list(dict.fromkeys(old_val + new_val))
                            if merged != old_val:
                                setattr(record, field, merged)
                                changed = True
                        # 对于对象列表(sku_list, spec_list), 用新值替换旧值(更完整)
                        elif new_val and isinstance(new_val[0], dict):
                            setattr(record, field, new_val)
                            changed = True

            merged_facts = _merge_facts(record.facts, product.facts)
            if merged_facts != _as_list(record.facts):
                record.facts = merged_facts
                changed = True

            merged_colors = _merge_unique_strings(record.color_list, product.color_list)
            if merged_colors != _as_list(record.color_list):
                record.color_list = merged_colors
                changed = True

            merged_variants = _merge_variants(record.variants, product.variants)
            if merged_variants != _as_list(record.variants):
                record.variants = merged_variants
                changed = True

            if product.ozon_metrics:
                old_metrics = record.ozon_metrics or {}
                if isinstance(old_metrics, str):
                    import json as _j
                    try:
                        old_metrics = _j.loads(old_metrics)
                    except Exception:
                        old_metrics = {}
                merged_metrics = {**old_metrics, **product.ozon_metrics}
                old_missing = set(old_metrics.get("missingFields") or [])
                new_missing = set(product.ozon_metrics.get("missingFields") or [])
                if new_missing or old_missing:
                    merged_metrics["missingFields"] = sorted(new_missing if len(new_missing) <= len(old_missing) or not old_missing else old_missing)
                if merged_metrics != old_metrics:
                    record.ozon_metrics = merged_metrics
                    changed = True

            # 数值字段: 新值 > 0 时更新
            for field in ('ozon_category_id', 'ozon_type_id'):
                new_val = getattr(product, field)
                if new_val and new_val > 0 and new_val != getattr(record, field):
                    setattr(record, field, new_val)
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


def bulk_delete_scraped_products(db: Session, record_ids: List[int]) -> int:
    """批量删除采集记录，返回实际删除数量"""
    if not record_ids:
        return 0
    deleted = db.query(ScrapedProductRecord).filter(ScrapedProductRecord.id.in_(record_ids)).delete(synchronize_session=False)
    db.commit()
    return deleted
