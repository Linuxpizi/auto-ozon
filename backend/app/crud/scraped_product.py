import json
import re
from typing import Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.scraped_product import ScrapedProductRecord
from app.schemas.scraped_product import OzonListProductCreate, ScrapedProductCreate


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
        record_name=product.record_name,
        selected_sku=product.selected_sku,
        title_ru=product.title_ru,
        description_ru=product.description_ru,
        variant_attr_ids=product.variant_attr_ids,
        collection_status=product.collection_status,
        ozon_category_path_id=product.ozon_category_path_id,
        video_urls=product.video_urls,
        sku_list=product.sku_list,
        variants=product.variants,
        spec_list=product.spec_list,
        facts=product.facts,
        tags=_merge_unique_strings([], product.tags),
        color_list=product.color_list,
        package_facts=product.package_facts,
        ozon_attribute_facts=product.ozon_attribute_facts,
        ozon_category_id=product.ozon_category_id,
        ozon_type_id=product.ozon_type_id,
        ozon_metrics=product.ozon_metrics,
        warehouse=product.warehouse,
        warehouse_id=product.warehouse_id,
        logistics_type=product.logistics_type,
        delivery_method=product.delivery_method,
        delivery_region=product.delivery_region,
        delivery_days=product.delivery_days,
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


def _is_empty_json_value(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _json_identity(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except (TypeError, ValueError):
        return repr(value)


def _merge_json_lists(old_value: Any, new_value: Any) -> list:
    """Union JSON arrays without rebuilding their records or dropping unknown keys."""
    merged: list = []
    seen: set[str] = set()
    for item in _as_list(old_value) + _as_list(new_value):
        identity = _json_identity(item)
        if identity in seen:
            continue
        seen.add(identity)
        merged.append(item)
    return merged


def _deep_merge_json(old_value: Any, new_value: Any, *, prefer_new: bool = True) -> Any:
    """Merge open JSON facts recursively; absent input never erases persisted facts."""
    if isinstance(old_value, dict) and isinstance(new_value, dict):
        merged = {**old_value}
        for key, value in new_value.items():
            if key in merged:
                merged[key] = _deep_merge_json(merged[key], value, prefer_new=prefer_new)
            elif not _is_empty_json_value(value):
                merged[key] = value
        return merged
    if isinstance(old_value, list) and isinstance(new_value, list):
        return _merge_json_lists(old_value, new_value)
    if _is_empty_json_value(new_value):
        return old_value
    if _is_empty_json_value(old_value):
        return new_value
    return new_value if prefer_new else old_value


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
        if existing is not None:
            combined = _deep_merge_json(existing, fact, prefer_new=False)
            combined["name"] = existing["name"]
            combined["value"] = existing["value"]
            existing.clear()
            existing.update(combined)
            continue
        normalized = {**fact, "name": name, "value": value}
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
            if not _is_empty_json_value(value):
                enriched[field] = _deep_merge_json(existing.get(field), value)
        enriched["values"] = _merge_variant_values(existing.get("values"), variant.get("values"))
        merged[existing_index] = enriched
    return merged


def _merge_variant_values(old_value: Any, new_value: Any) -> list[dict]:
    merged: list[dict] = []
    by_key: dict[tuple[str, str], dict] = {}
    for item in _as_list(old_value) + _as_list(new_value):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        value = str(item.get("value") or "").strip()
        if not name or not value:
            continue
        key = (name.casefold(), value.casefold())
        existing = by_key.get(key)
        if existing is not None:
            combined = _deep_merge_json(existing, item)
            combined["name"] = name
            combined["value"] = value
            existing.clear()
            existing.update(combined)
            continue
        normalized = {**item, "name": name, "value": value}
        by_key[key] = normalized
        merged.append(normalized)
    return merged


def _ozon_attribute_identity(fact: dict) -> Optional[tuple[str, str, str]]:
    attribute_id = fact.get("attributeId", fact.get("attribute_id"))
    try:
        normalized_id = int(attribute_id)
    except (TypeError, ValueError):
        return None
    if normalized_id <= 0:
        return None
    scope = str(fact.get("scope") or "").strip().casefold()
    complex_group = str(fact.get("complexGroupId", fact.get("complex_group_id")) or "").strip()
    return str(normalized_id), scope, complex_group


def _ozon_attribute_value_identity(value: dict) -> Optional[tuple[str, str]]:
    dictionary_id = value.get("dictionaryValueId", value.get("dictionary_value_id"))
    text_value = str(value.get("value") or "").strip()
    if dictionary_id not in (None, ""):
        try:
            return str(int(dictionary_id)), text_value.casefold()
        except (TypeError, ValueError):
            pass
    return ("", text_value.casefold()) if text_value else None


def _merge_ozon_attribute_values(old_value: Any, new_value: Any) -> list:
    merged: list = []
    by_key: dict[tuple[str, str], dict] = {}
    seen_unkeyed: set[str] = set()
    for value in _as_list(old_value) + _as_list(new_value):
        if not isinstance(value, dict):
            identity = _json_identity(value)
            if identity not in seen_unkeyed:
                seen_unkeyed.add(identity)
                merged.append(value)
            continue
        key = _ozon_attribute_value_identity(value)
        if key is None:
            identity = _json_identity(value)
            if identity not in seen_unkeyed:
                seen_unkeyed.add(identity)
                merged.append(value)
            continue
        existing = by_key.get(key)
        if existing is None:
            normalized = {**value}
            by_key[key] = normalized
            merged.append(normalized)
        else:
            combined = _deep_merge_json(existing, value)
            existing.clear()
            existing.update(combined)
    return merged


def _merge_ozon_attribute_facts(old_value: Any, new_value: Any) -> list:
    merged: list = []
    by_key: dict[tuple[str, str, str], dict] = {}
    seen_unkeyed: set[str] = set()
    for fact in _as_list(old_value) + _as_list(new_value):
        if not isinstance(fact, dict):
            identity = _json_identity(fact)
            if identity not in seen_unkeyed:
                seen_unkeyed.add(identity)
                merged.append(fact)
            continue
        key = _ozon_attribute_identity(fact)
        if key is None:
            identity = _json_identity(fact)
            if identity not in seen_unkeyed:
                seen_unkeyed.add(identity)
                merged.append(fact)
            continue
        existing = by_key.get(key)
        if existing is None:
            normalized = {**fact}
            normalized["values"] = _merge_ozon_attribute_values([], fact.get("values"))
            by_key[key] = normalized
            merged.append(normalized)
        else:
            combined = _deep_merge_json(existing, fact)
            combined["values"] = _merge_ozon_attribute_values(existing.get("values"), fact.get("values"))
            existing.clear()
            existing.update(combined)
    return merged


def _parse_ozon_list_number(value: str) -> Optional[float]:
    """Parse a factual number from Ozon card text without guessing a missing value."""
    match = re.search(r"[-+]?\d(?:[\d\s\u00a0\u202f.,]*\d)?", value or "")
    if match is None:
        return None
    normalized = re.sub(r"[\s\u00a0\u202f]", "", match.group(0))
    separators = [index for index, char in enumerate(normalized) if char in ".,"]
    if separators:
        last_separator = separators[-1]
        decimal_length = len(normalized) - last_separator - 1
        # Ozon's Russian cards use comma for decimals; a lone three-digit group
        # such as ``1.299 ₽`` is a thousands separator, not a fractional price.
        grouped_integer = decimal_length == 3 and len(separators) == 1
        if grouped_integer:
            normalized = normalized.replace(".", "").replace(",", "")
        else:
            integer = normalized[:last_separator].replace(".", "").replace(",", "")
            decimal = normalized[last_separator + 1 :]
            normalized = f"{integer}.{decimal}"
    try:
        return float(normalized)
    except ValueError:
        return None


def _parse_ozon_list_count(value: str) -> Optional[int]:
    parsed = _parse_ozon_list_number(value)
    if parsed is None:
        return None
    number_match = re.search(r"[-+]?\d(?:[\d\s\u00a0\u202f.,]*\d)?", value or "")
    suffix = (value or "")[number_match.end() :].lstrip().casefold() if number_match else ""
    # Only a compact suffix directly following the number is authoritative.
    # Searching the whole label would mistake ordinary words such as
    # ``оценок`` for a Cyrillic ``к`` (thousand) suffix.
    multiplier = 1_000_000 if re.match(r"[mм]\b", suffix) else 1_000 if re.match(r"[kк]\b", suffix) else 1
    return max(0, int(parsed * multiplier))


def _ozon_list_facts(product: OzonListProductCreate) -> list[dict]:
    source_path = "Ozon list card"
    values = (
        ("促销参与状态", product.promo_joined),
        ("促销名称", product.promo_name),
        ("促销库存文本", product.promo_stock),
        ("积分评价", product.points_review),
        ("品牌认证", product.brand_cert),
    )
    return [
        {"name": name, "value": value.strip(), "sourcePath": source_path}
        for name, value in values
        if value and value.strip()
    ]


def _dedupe_ozon_list_products(
    products: List[OzonListProductCreate],
) -> tuple[list[OzonListProductCreate], int]:
    """Merge repeated SKUs while retaining the latest non-empty card facts."""
    by_sku: dict[str, OzonListProductCreate] = {}
    duplicate_count = 0
    fields = tuple(OzonListProductCreate.model_fields)
    for product in products:
        previous = by_sku.get(product.sku)
        if previous is None:
            by_sku[product.sku] = product
            continue
        duplicate_count += 1
        updates = {}
        for field in fields:
            if field == "sku":
                continue
            value = getattr(product, field)
            if value is not None and (not isinstance(value, str) or value.strip()):
                updates[field] = value
        by_sku[product.sku] = previous.model_copy(update=updates)
    return list(by_sku.values()), duplicate_count


def upsert_ozon_list_products(
    db: Session,
    products: List[OzonListProductCreate],
) -> tuple[int, int, int]:
    """Upsert sparse Ozon list-card facts without invoking PDP completeness rules.

    The catalog is globally shared. Legacy duplicate rows may exist, so the oldest
    matching row is selected deterministically; this operation does not claim or
    introduce database-level uniqueness.
    """
    unique_products, skipped = _dedupe_ozon_list_products(products)
    requested_skus = [product.sku for product in unique_products]
    existing_rows = (
        db.query(ScrapedProductRecord)
        .filter(
            ScrapedProductRecord.platform == "ozon",
            ScrapedProductRecord.source_id.in_(requested_skus),
        )
        .order_by(ScrapedProductRecord.id.asc())
        .all()
    )
    existing_by_sku: dict[str, ScrapedProductRecord] = {}
    for row in existing_rows:
        existing_by_sku.setdefault(row.source_id, row)

    created = 0
    updated = 0
    for product in unique_products:
        record = existing_by_sku.get(product.sku)
        price = _parse_ozon_list_number(product.price)
        old_price = _parse_ozon_list_number(product.original_price)
        rating = _parse_ozon_list_number(product.rating)
        review_count = _parse_ozon_list_count(product.review_count)
        incoming_facts = _ozon_list_facts(product)

        if record is None:
            record = ScrapedProductRecord(
                platform="ozon",
                source_id=product.sku,
                title=product.title.strip(),
                price=price or 0.0,
                old_price=old_price or 0.0,
                currency="RUB",
                images=[product.image_url.strip()] if product.image_url.strip() else [],
                rating=rating or 0.0,
                review_count=review_count or 0,
                discount=product.discount.strip(),
                source_url=product.product_url.strip(),
                scraped_at=product.scraped_at,
                facts=incoming_facts,
                synced=True,
            )
            db.add(record)
            existing_by_sku[product.sku] = record
            created += 1
            continue

        changed = False
        title = product.title.strip()
        if title and (not record.title or len(title) > len(record.title)):
            record.title = title
            changed = True

        image_url = product.image_url.strip()
        if image_url and not _as_list(record.images):
            record.images = [image_url]
            changed = True

        for field, value in (
            ("price", price),
            ("old_price", old_price),
            ("rating", rating),
        ):
            if value is not None and value > 0 and value != getattr(record, field):
                setattr(record, field, value)
                changed = True

        if review_count is not None and review_count > (record.review_count or 0):
            record.review_count = review_count
            changed = True

        discount = product.discount.strip()
        if discount and discount != record.discount:
            record.discount = discount
            changed = True

        source_url = product.product_url.strip()
        if source_url and source_url != record.source_url:
            record.source_url = source_url
            changed = True

        if product.scraped_at and product.scraped_at != record.scraped_at:
            record.scraped_at = product.scraped_at
            changed = True

        merged_facts = _merge_facts(record.facts, incoming_facts)
        if merged_facts != _as_list(record.facts):
            record.facts = merged_facts
            changed = True

        if changed:
            updated += 1
        else:
            skipped += 1

    db.commit()
    return created, updated, skipped


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
                record_name=product.record_name,
                selected_sku=product.selected_sku,
                title_ru=product.title_ru,
                description_ru=product.description_ru,
                variant_attr_ids=product.variant_attr_ids,
                collection_status=product.collection_status,
                ozon_category_path_id=product.ozon_category_path_id,
                video_urls=product.video_urls,
                sku_list=product.sku_list,
                variants=product.variants,
                spec_list=product.spec_list,
                facts=product.facts,
                tags=_merge_unique_strings([], product.tags),
                color_list=product.color_list,
                package_facts=product.package_facts,
                ozon_attribute_facts=product.ozon_attribute_facts,
                ozon_category_id=product.ozon_category_id,
                ozon_type_id=product.ozon_type_id,
                ozon_metrics=product.ozon_metrics,
                warehouse=product.warehouse,
                warehouse_id=product.warehouse_id,
                logistics_type=product.logistics_type,
                delivery_method=product.delivery_method,
                delivery_region=product.delivery_region,
                delivery_days=product.delivery_days,
                price_ranges=product.price_ranges,
                min_order_qty=product.min_order_qty,
                supplier_url=product.supplier_url,
                trade_quantity=product.trade_quantity,
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

            if product.scraped_at and product.scraped_at != record.scraped_at:
                record.scraped_at = product.scraped_at
                changed = True

            # ── 补全字段（新值非空时更新） ──
            for field in ('discount', 'stock', 'brand', 'category', 'description'):
                new_val = getattr(product, field)
                if new_val and new_val != getattr(record, field):
                    setattr(record, field, new_val)
                    changed = True

            # 商品级元数据、物流与 1688 字符串事实：空同步不擦除已有事实。
            for field in (
                'record_name', 'selected_sku', 'title_ru', 'description_ru',
                'collection_status', 'warehouse', 'warehouse_id', 'logistics_type',
                'delivery_method', 'delivery_region', 'supplier_url',
            ):
                new_val = getattr(product, field)
                if _is_enriched(new_val, getattr(record, field)):
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

            # 采集同步只补充非空标签；不清除用户在选品页手动维护的标签。
            merged_tags = _merge_unique_strings(record.tags, product.tags)
            if merged_tags != _as_list(record.tags):
                record.tags = merged_tags
                changed = True

            merged_colors = _merge_unique_strings(record.color_list, product.color_list)
            if merged_colors != _as_list(record.color_list):
                record.color_list = merged_colors
                changed = True

            if product.package_facts:
                old_package_facts = record.package_facts or {}
                merged_package_facts = _deep_merge_json(old_package_facts, product.package_facts)
                if merged_package_facts != old_package_facts:
                    record.package_facts = merged_package_facts
                    changed = True

            old_attribute_facts = _as_list(record.ozon_attribute_facts)
            merged_attribute_facts = _merge_ozon_attribute_facts(
                old_attribute_facts,
                product.ozon_attribute_facts,
            )
            if merged_attribute_facts != old_attribute_facts:
                record.ozon_attribute_facts = merged_attribute_facts
                changed = True

            old_variant_attr_ids = [item for item in _as_list(record.variant_attr_ids) if isinstance(item, int) and item > 0]
            merged_variant_attr_ids = list(dict.fromkeys(old_variant_attr_ids + product.variant_attr_ids))
            if merged_variant_attr_ids != old_variant_attr_ids:
                record.variant_attr_ids = merged_variant_attr_ids
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
            for field in (
                'ozon_category_path_id', 'ozon_category_id', 'ozon_type_id',
                'delivery_days', 'min_order_qty', 'trade_quantity',
            ):
                new_val = getattr(product, field)
                if new_val and new_val > 0 and new_val != getattr(record, field):
                    setattr(record, field, new_val)
                    changed = True

            if _is_enriched(product.price_ranges, record.price_ranges, "list"):
                record.price_ranges = product.price_ranges
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
