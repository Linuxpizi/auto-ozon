"""
Unified Upload Service — 单一入口处理采集商品 → Ozon 上架全流程。

设计原则：
  1. 所有 Ozon API 交互集中在此服务，不在 router 层构建 payload
  2. 草稿 (UploadDraft) 作为中间态，支持 review/edit → submit → track
  3. 批量操作与单条操作使用同一底层方法
"""

import copy
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, List, Optional

from sqlalchemy.orm import Session

from app.models.upload_draft import UploadDraft
from app.models.scraped_product import ScrapedProductRecord
from app.models.store import Store
from app.services.ozon_client import OzonClient
import app.crud.upload_draft as draft_crud

logger = logging.getLogger(__name__)

_OZON_VAT_VALUES = ("0", "0.05", "0.07", "0.1", "0.2", "0.22")


PACKAGE_FIELDS: dict[str, dict[str, Any]] = {
    "weight": {
        "fact_keys": ("packageWeightG", "package_weight_g"),
        "metric_keys": ("packageWeightG", "package_weight_g"),
        "label": "包装重量(g)",
    },
    "depth": {
        "fact_keys": ("packageDepthMm", "package_depth_mm"),
        "metric_keys": (
            "packageDepthMm",
            "package_depth_mm",
            "packageLengthMm",
            "package_length_mm",
        ),
        "label": "包装长度/深度(mm)",
    },
    "width": {
        "fact_keys": ("packageWidthMm", "package_width_mm"),
        "metric_keys": ("packageWidthMm", "package_width_mm"),
        "label": "包装宽度(mm)",
    },
    "height": {
        "fact_keys": ("packageHeightMm", "package_height_mm"),
        "metric_keys": ("packageHeightMm", "package_height_mm"),
        "label": "包装高度(mm)",
    },
}

_PACKAGE_PROVENANCE_KEYS = (
    "packagePhysicalProvenance",
    "package_physical_provenance",
)
_VARIANT_IDENTITY_KEYS = ("id", "productId", "product_id", "sku", "offerId", "offer_id")


class OzonItemValidationError(ValueError):
    """Actionable validation errors for one Ozon import item."""

    def __init__(self, errors: list[str]):
        self.errors = list(dict.fromkeys(error for error in errors if error))
        super().__init__("；".join(self.errors))


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _first_present(mapping: Any, keys: tuple[str, ...]) -> Any:
    data = _as_dict(mapping)
    for key in keys:
        if key in data:
            return data[key]
    return None


def _positive_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.strip().replace(",", "."))
        except ValueError:
            return None
    else:
        return None
    return number if number > 0 else None


def _positive_int(value: Any) -> int | None:
    number = _positive_number(value)
    return int(round(number)) if number is not None else None


def _positive_id(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return normalized if normalized > 0 else None


def _truthy_flag(value: Any) -> bool:
    return value is True


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Price conversion helpers ──────────────────────────────────────────

def generate_offer_id(
    source_product_id: int,
    source_sku: str = "",
    prefix: str = "",
) -> str:
    """生成唯一的 offer_id。格式: prefix-sku-pid 或 prefix-pid"""
    short_uuid = uuid.uuid4().hex[:6]
    if source_sku:
        return f"{prefix}{source_sku}-{short_uuid}" if prefix else f"{source_sku}-{short_uuid}"
    return f"{prefix}SP{source_product_id}-{short_uuid}" if prefix else f"SP{source_product_id}-{short_uuid}"


def convert_price_to_rub(
    price_cny: float,
    exchange_rate: float = 0.0,
    markup_pct: float = 0.0,
    commission_pct: float = 0.0,
) -> float:
    """CNY → RUB 定价公式：(CNY × 汇率) × (1 + markup%) × (1 + commission%)"""
    if price_cny <= 0:
        return 0.0
    rate = exchange_rate if exchange_rate > 0 else 12.5
    base = price_cny * rate
    markup_mult = 1.0 + (markup_pct / 100.0) if markup_pct > 0 else 1.0
    comm_mult = 1.0 + (commission_pct / 100.0) if commission_pct > 0 else 1.0
    return round(base * markup_mult * comm_mult, 2)


def format_ozon_price(value: Any) -> str:
    """Format a positive monetary amount as an Ozon decimal string."""
    if value is None or isinstance(value, bool):
        return ""
    try:
        amount = Decimal(str(value).strip().replace(",", "."))
        if not amount.is_finite() or amount <= 0:
            return ""
        rounded = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return ""
    return format(rounded, "f").rstrip("0").rstrip(".")


def _normalize_ozon_vat(value: Any) -> str | None:
    """Return the canonical Product API VAT enum value, if supported."""
    raw = str(value or "0").strip().replace(",", ".")
    try:
        amount = Decimal(raw)
    except InvalidOperation:
        return None
    for allowed in _OZON_VAT_VALUES:
        if amount == Decimal(allowed):
            return allowed
    return None


# ── Draft creation ────────────────────────────────────────────────────

def _normalize_sku_identity(value: Any) -> str:
    """Match the editable SKU contract used by the selection frontend."""
    return str(value).strip() if value is not None else ""


def _selected_editable_sku(record: ScrapedProductRecord, source_sku: str) -> Optional[dict]:
    identity = _normalize_sku_identity(source_sku)
    rows = record.sku_list if isinstance(record.sku_list, list) else []
    if not identity:
        return None
    return next(
        (
            row
            for row in rows
            if isinstance(row, dict)
            and _normalize_sku_identity(row.get("sku")) == identity
        ),
        None,
    )


def _identity_matches(row: Any, identity: str) -> bool:
    if not isinstance(row, dict) or not identity:
        return False
    return any(
        _normalize_sku_identity(row.get(key)) == identity
        for key in _VARIANT_IDENTITY_KEYS
    )


def _matching_variant(record: ScrapedProductRecord, identity: str) -> Optional[dict[str, Any]]:
    variants = _as_dict_list(record.variants)
    explicit = next((row for row in variants if _identity_matches(row, identity)), None)
    if explicit is not None:
        return explicit
    # A top-level selected SKU can own a single factual variant even if old
    # collectors did not repeat the identity in the variant object.
    if identity and identity == _normalize_sku_identity(record.selected_sku) and len(variants) == 1:
        return variants[0]
    return None


def _selected_sku_snapshot(
    record: ScrapedProductRecord,
    source_sku: str,
) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]], Optional[dict[str, Any]]]:
    """Return editable row, factual variant and a lossless merged snapshot."""
    identity = _normalize_sku_identity(source_sku)
    editable = _selected_editable_sku(record, identity)
    variant = _matching_variant(record, identity)
    if editable is None and variant is None:
        return None, None, None

    merged: dict[str, Any] = {}
    if variant is not None:
        merged.update(copy.deepcopy(variant))
    if editable is not None:
        # Editable SKU owns identity, barcode, title, price and media. Keep the
        # exact two inputs too, so merging never destroys unknown nested facts.
        merged.update(copy.deepcopy(editable))
    merged["selectionIdentity"] = identity
    merged["editableSkuSnapshot"] = copy.deepcopy(editable)
    merged["variantSnapshot"] = copy.deepcopy(variant)
    return editable, variant, merged


def _field_provenance(snapshot: Any, fact_keys: tuple[str, ...]) -> Optional[dict[str, Any]]:
    provenance_map = _as_dict(_first_present(snapshot, _PACKAGE_PROVENANCE_KEYS))
    for key in fact_keys:
        provenance = provenance_map.get(key)
        if isinstance(provenance, dict) and provenance:
            return copy.deepcopy(provenance)
    return None


def _snapshot_package_value(snapshot: Any, field: str) -> tuple[int | None, dict[str, Any] | None]:
    config = PACKAGE_FIELDS[field]
    value = _positive_int(_first_present(snapshot, config["fact_keys"]))
    if value is None:
        return None, None
    return value, _field_provenance(snapshot, config["fact_keys"])


def _merge_package_facts(
    selected_variant: Optional[dict[str, Any]],
    product_package: Any,
    ozon_metrics: Any,
) -> tuple[dict[str, int | None], dict[str, Any]]:
    """Merge package facts field-by-field without touching item/net metrics."""
    scalars: dict[str, int | None] = {}
    package_facts: dict[str, Any] = {}
    provenance: dict[str, Any] = {}
    product_package_dict = _as_dict(product_package)
    metrics = _as_dict(ozon_metrics)

    for field, config in PACKAGE_FIELDS.items():
        value, source = _snapshot_package_value(selected_variant, field)
        if value is not None:
            source = source or {
                "source": "selected_sku_snapshot",
                "sourcePath": f"variantsData.selected.{config['fact_keys'][0]}",
            }
        if value is None:
            value, source = _snapshot_package_value(product_package_dict, field)
            if value is not None:
                source = source or {
                    "source": "scraped_product_package",
                    "sourcePath": f"packageFacts.{config['fact_keys'][0]}",
                }
        if value is None:
            value = _positive_int(_first_present(metrics, config["metric_keys"]))
            if value is not None:
                source = {
                    "source": "ozon_metrics_package",
                    "sourcePath": f"ozonMetrics.{config['metric_keys'][0]}",
                }

        scalars[field] = value
        if value is not None:
            fact_key = config["fact_keys"][0]
            package_facts[fact_key] = value
            provenance[fact_key] = source

    if provenance:
        package_facts["packagePhysicalProvenance"] = provenance
    return scalars, package_facts


def _valid_http_urls(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    urls: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        url = item.strip()
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        urls.append(url)
    return urls


def _variant_video_urls(variant: Any) -> tuple[bool, list[str]]:
    data = _as_dict(variant)
    owned = any(key in data for key in ("video", "videos", "videoUrls", "video_urls"))
    candidates: list[Any] = []
    if "video" in data:
        candidates.append(data.get("video"))
    for key in ("videos", "videoUrls", "video_urls"):
        value = data.get(key)
        if isinstance(value, list):
            candidates.extend(value)
    return owned, _valid_http_urls(candidates)


def _attribute_key(fact: dict[str, Any]) -> tuple[int, str, str]:
    attribute_id = _positive_id(fact.get("attributeId", fact.get("attribute_id"))) or 0
    scope = str(fact.get("scope") or "")
    complex_group = str(fact.get("complexGroupId", fact.get("complex_group_id")) or "")
    return attribute_id, scope, complex_group


def _merge_attribute_facts(product_facts: Any, variant_facts: Any) -> list[dict[str, Any]]:
    """Preserve all facts; exact selected-SKU facts replace equal product keys."""
    merged: dict[tuple[int, str, str], dict[str, Any]] = {}
    invalid: list[dict[str, Any]] = []
    for raw in [*_as_dict_list(product_facts), *_as_dict_list(variant_facts)]:
        fact = copy.deepcopy(raw)
        key = _attribute_key(fact)
        if key[0] <= 0:
            invalid.append(fact)
        else:
            merged[key] = fact
    return [*merged.values(), *invalid]


def _package_fact_has_source(draft: UploadDraft, field: str) -> bool:
    config = PACKAGE_FIELDS[field]
    scalar_value = _positive_int(getattr(draft, field, None))
    facts = _as_dict(getattr(draft, "package_facts", None))
    fact_value = _positive_int(_first_present(facts, config["fact_keys"]))
    provenance = _field_provenance(facts, config["fact_keys"])
    audit = _as_dict(getattr(draft, "package_override_audit", None)).get(field)
    factual_match = (
        scalar_value is not None
        and fact_value == scalar_value
        and isinstance(provenance, dict)
        and bool(provenance)
    )
    audited_match = (
        scalar_value is not None
        and isinstance(audit, dict)
        and audit.get("source") == "manual_override"
        and _positive_int(audit.get("value")) == scalar_value
    )
    return factual_match or audited_match


def get_draft_readiness_errors(draft: UploadDraft) -> list[str]:
    errors: list[str] = []
    if _positive_id(getattr(draft, "description_category_id", None)) is None:
        errors.append("缺少有效的 Ozon 描述分类 ID")
    if _positive_id(getattr(draft, "type_id", None)) is None:
        errors.append("缺少有效的 Ozon 类型 ID")
    if not str(getattr(draft, "offer_id", "") or "").strip():
        errors.append("缺少 offer_id")
    if not str(getattr(draft, "name", "") or "").strip():
        errors.append("缺少商品标题")
    if _positive_number(getattr(draft, "price_rub", None)) is None:
        errors.append("上架价格必须大于 0 RUB")
    if _normalize_ozon_vat(getattr(draft, "vat", None)) is None:
        errors.append(f"VAT 必须是 Ozon 支持的值：{', '.join(_OZON_VAT_VALUES)}")

    valid_images = _valid_http_urls(getattr(draft, "images", None))
    primary = str(getattr(draft, "primary_image", "") or "").strip()
    if primary.startswith(("http://", "https://")) and primary not in valid_images:
        valid_images.insert(0, primary)
    if not valid_images:
        errors.append("至少需要一张有效的 HTTP(S) 商品图片")

    for field, config in PACKAGE_FIELDS.items():
        if _positive_int(getattr(draft, field, None)) is None:
            errors.append(f"缺少有效的{config['label']}")
        elif not _package_fact_has_source(draft, field):
            errors.append(f"{config['label']}缺少采集来源或人工修改审计，不能使用历史默认值")
    return errors


def draft_readiness_update(draft: UploadDraft) -> dict[str, Any]:
    errors = get_draft_readiness_errors(draft)
    return {
        "status": "ready" if not errors else "draft",
        "readiness_errors": errors,
        "error_message": "" if not errors else "；".join(errors),
    }


def apply_package_override_audit(
    draft: UploadDraft,
    updates: dict[str, Any],
    reason: str | None = None,
) -> dict[str, Any]:
    """Return field-level audit metadata for explicit manual package edits."""
    audit = copy.deepcopy(_as_dict(getattr(draft, "package_override_audit", None)))
    normalized_reason = str(reason or "").strip() or "legacy manual edit"
    timestamp = _utc_timestamp()
    for field in PACKAGE_FIELDS:
        if field not in updates:
            continue
        audit[field] = {
            "source": "manual_override",
            "reason": normalized_reason,
            "capturedAt": timestamp,
            "value": updates[field],
        }
    return audit


def _valid_http_images(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [
        image.strip()
        for image in value
        if isinstance(image, str) and image.strip().startswith(("http://", "https://"))
    ]


def _draft_number(value: Any) -> float:
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip().replace(",", "."))
        except ValueError:
            return 0.0
    return 0.0


def _serialize_tags(value: Any) -> Optional[str]:
    if not isinstance(value, list):
        return None

    tags: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str) or not item.strip():
            continue
        tag = item.strip()
        key = tag.casefold()
        if key in seen:
            continue
        seen.add(key)
        tags.append(tag)
    return ", ".join(tags) or None


def _draft_data_from_scraped_record(
    record: ScrapedProductRecord,
    store_id: int,
    *,
    source_sku: str = "",
    description_category_id: int = 0,
    type_id: int = 0,
    category_name: str = "",
    offer_id: str = "",
    name: str = "",
    price_rub: float = 0.0,
    old_price_rub: float = 0.0,
) -> dict[str, Any]:
    """Normalize one loaded scraped record into the canonical draft shape.

    This function deliberately performs no persistence.  Both reviewed drafts
    and legacy direct-selection uploads must cross this same factual boundary
    before strict Ozon readiness validation.
    """
    source_product_id = int(record.id or 0)
    selected_sku, selected_variant, selected_snapshot = _selected_sku_snapshot(record, source_sku)
    selected_identity = (
        _normalize_sku_identity(selected_sku.get("sku"))
        if selected_sku is not None
        else _normalize_sku_identity(source_sku) if selected_variant is not None else ""
    )
    effective_source_sku = selected_identity or _normalize_sku_identity(record.source_id)

    # Property ownership matters here: ``images: []`` means the user cleared
    # this SKU and must not be silently repopulated from product-level images.
    selected_owner = selected_sku if selected_sku is not None else selected_variant
    image_source = (
        selected_owner.get("images")
        if selected_owner is not None and "images" in selected_owner
        else record.images
    )
    valid_images = _valid_http_images(image_source)
    selected_name = (
        str(selected_owner.get("name") or "").strip()
        if selected_owner is not None and "name" in selected_owner
        else record.title or ""
    )
    selected_price = (
        _draft_number(selected_owner.get("price"))
        if selected_owner is not None and "price" in selected_owner
        else _draft_number(record.price)
    )
    selected_old_price_value = (
        _first_present(selected_owner, ("oldPrice", "old_price"))
        if selected_owner is not None
        else None
    )
    selected_old_price = _draft_number(selected_old_price_value)
    if selected_old_price <= 0:
        selected_old_price = _draft_number(record.old_price)
    selected_barcode = (
        str(selected_owner.get("barcode") or "").strip()
        if selected_owner is not None and "barcode" in selected_owner
        else ""
    )
    package_scalars, package_facts = _merge_package_facts(
        selected_variant,
        record.package_facts,
        record.ozon_metrics,
    )
    variant_owns_videos, selected_videos = _variant_video_urls(selected_variant)
    video_urls = selected_videos if variant_owns_videos else _valid_http_urls(record.video_urls)
    variant_attribute_facts = (
        _first_present(selected_variant, ("ozonAttributeFacts", "ozon_attribute_facts"))
        if selected_variant is not None
        else []
    )
    attribute_facts = _merge_attribute_facts(
        record.ozon_attribute_facts,
        variant_attribute_facts,
    )
    effective_category_id = description_category_id or _positive_id(record.ozon_category_id) or 0
    effective_type_id = type_id or _positive_id(record.ozon_type_id) or 0

    # Auto-generate offer_id if empty
    if not offer_id:
        offer_id = generate_offer_id(source_product_id, effective_source_sku)

    return {
        "store_id": store_id,
        "source_type": "scraped",
        "source_product_id": source_product_id,
        "source_sku": effective_source_sku,
        "source_name": selected_name,
        "source_url": record.source_url or "",
        "source_images": valid_images,
        "description_category_id": effective_category_id,
        "type_id": effective_type_id,
        "category_name": category_name or record.category or "",
        "offer_id": offer_id,
        "barcode": selected_barcode,
        "name": name or selected_name,
        "description": record.description or record.description_ru or "",
        "price_cny": selected_price,
        "price_rub": price_rub,
        "old_price_rub": old_price_rub if old_price_rub > 0 else selected_old_price,
        "primary_image": valid_images[0] if valid_images else "",
        "images": valid_images[:30],
        "ozonbox_tags": _serialize_tags(record.tags),
        **package_scalars,
        "selected_sku_snapshot": selected_snapshot,
        "package_facts": package_facts or None,
        "package_override_audit": None,
        "ozon_attribute_facts": attribute_facts or None,
        "video_urls": video_urls or None,
        "text_facts": copy.deepcopy(record.facts) if isinstance(record.facts, list) else None,
        "ozon_metrics": copy.deepcopy(record.ozon_metrics) if isinstance(record.ozon_metrics, dict) else None,
        "status": "draft",
    }


def build_transient_draft_from_scraped(
    record: ScrapedProductRecord,
    store_id: int,
    **overrides: Any,
) -> UploadDraft:
    """Build a non-persisted canonical draft for strict direct submission."""
    draft_data = _draft_data_from_scraped_record(record, store_id, **overrides)
    transient = UploadDraft(**draft_data)
    readiness = draft_readiness_update(transient)
    transient.status = readiness["status"]
    transient.readiness_errors = readiness["readiness_errors"]
    transient.error_message = readiness["error_message"]
    return transient


def create_draft_from_scraped(
    db: Session,
    store_id: int,
    source_product_id: int,
    *,
    source_sku: str = "",
    description_category_id: int = 0,
    type_id: int = 0,
    category_name: str = "",
    offer_id: str = "",
    name: str = "",
    price_rub: float = 0.0,
    old_price_rub: float = 0.0,
) -> UploadDraft:
    """从单个采集商品创建上架草稿"""
    record = db.query(ScrapedProductRecord).filter(
        ScrapedProductRecord.id == source_product_id
    ).first()
    if not record:
        raise ValueError(f"采集商品 {source_product_id} 不存在")

    draft_data = _draft_data_from_scraped_record(
        record,
        store_id,
        source_sku=source_sku,
        description_category_id=description_category_id,
        type_id=type_id,
        category_name=category_name,
        offer_id=offer_id,
        name=name,
        price_rub=price_rub,
        old_price_rub=old_price_rub,
    )
    transient = UploadDraft(**draft_data)
    draft_data.update(draft_readiness_update(transient))
    return draft_crud.create_draft(db, draft_data)


def create_drafts_batch(
    db: Session,
    store_id: int,
    source_product_ids: List[int],
    *,
    description_category_id: int = 0,
    type_id: int = 0,
    offer_id_prefix: str = "",
    price_rub: float = 0.0,
    old_price_rub: float = 0.0,
    markup_pct: float = 0.0,
    exchange_rate: float = 0.0,
) -> List[UploadDraft]:
    """批量从采集商品创建上架草稿"""
    results = []
    for pid in source_product_ids:
        try:
            # Get scraped product for price conversion
            record = db.query(ScrapedProductRecord).filter(
                ScrapedProductRecord.id == pid
            ).first()
            if not record:
                logger.warning("Skip product %d: not found", pid)
                continue

            # Auto price: use markup if provided, otherwise use manual price_rub
            auto_price_rub = price_rub
            if markup_pct > 0 and record.price and record.price > 0:
                auto_price_rub = convert_price_to_rub(
                    record.price, exchange_rate=exchange_rate, markup_pct=markup_pct
                )

            # Auto offer_id per product
            auto_offer_id = generate_offer_id(pid, record.source_id, prefix=offer_id_prefix)

            draft = create_draft_from_scraped(
                db, store_id, pid,
                description_category_id=description_category_id,
                type_id=type_id,
                offer_id=auto_offer_id,
                price_rub=auto_price_rub,
                old_price_rub=old_price_rub,
            )
            results.append(draft)
        except Exception as e:
            logger.error("Failed to create draft for product %d: %s", pid, str(e))

    return results


# ── Ozon payload builder ──────────────────────────────────────────────


def _explicit_attribute_text(value: Any) -> str | None:
    """Normalize an explicit scalar without inventing text from metadata."""
    if value is None or isinstance(value, (dict, list, tuple, set)):
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    text = str(value).strip()
    return text or None


def _attribute_values(fact: Any) -> list[dict[str, Any]]:
    values = _first_present(fact, ("values",))
    if not isinstance(values, list):
        return []

    normalized: list[dict[str, Any]] = []
    seen: set[tuple[int, str]] = set()
    for raw in values:
        if not isinstance(raw, dict):
            continue
        text = _explicit_attribute_text(raw.get("value"))
        if text is None:
            continue
        dictionary_id = _positive_id(
            raw.get("dictionaryValueId", raw.get("dictionary_value_id"))
        ) or 0
        identity = (dictionary_id, text)
        if identity in seen:
            continue
        seen.add(identity)
        normalized.append({
            "dictionary_value_id": dictionary_id,
            "value": text,
        })
    return normalized


def _ozon_attributes(facts: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Build only explicitly recognized and publishable Ozon attributes.

    ``complexGroupId`` is an ownership/grouping fact, not a license to infer
    attributes from textual facts. A non-empty group creates one conservative
    ``complex_attributes`` wrapper. Numeric group IDs are preserved as
    ``complex_id``; opaque grouping keys use the API's neutral value ``0``.
    """
    ordinary_by_id: dict[int, dict[str, Any]] = {}
    complex_groups: dict[str, dict[int, dict[str, Any]]] = {}

    for fact in _as_dict_list(facts):
        attribute_id = _positive_id(fact.get("attributeId", fact.get("attribute_id")))
        if (
            attribute_id is None
            or not _truthy_flag(fact.get("recognized"))
            or not _truthy_flag(fact.get("publishable"))
        ):
            continue
        values = _attribute_values(fact)
        if not values:
            continue

        raw_group = fact.get("complexGroupId", fact.get("complex_group_id"))
        group_key = str(raw_group).strip() if raw_group is not None else ""
        if not group_key:
            # Later selected-SKU facts replace an equal product-level ID.
            ordinary_by_id[attribute_id] = {
                "id": attribute_id,
                "complex_id": 0,
                "values": values,
            }
            continue

        complex_id = _positive_id(raw_group) or 0
        complex_groups.setdefault(group_key, {})[attribute_id] = {
            "id": attribute_id,
            "complex_id": complex_id,
            "values": values,
        }

    complex_attributes = [
        {"attributes": list(attributes.values())}
        for attributes in complex_groups.values()
        if attributes
    ]
    return list(ordinary_by_id.values()), complex_attributes


def _build_ozon_item(draft: UploadDraft) -> dict:
    """Build one exact Ozon v3 item or raise actionable validation errors."""
    errors = get_draft_readiness_errors(draft)
    if errors:
        raise OzonItemValidationError(errors)

    valid_images = _valid_http_urls(getattr(draft, "images", None))
    primary_image = str(getattr(draft, "primary_image", "") or "").strip()
    if primary_image.startswith(("http://", "https://")):
        valid_images = [url for url in valid_images if url != primary_image][:29]
    else:
        primary_image = ""
        valid_images = valid_images[:30]
    attributes, complex_attributes = _ozon_attributes(
        getattr(draft, "ozon_attribute_facts", None)
    )

    item = {
        "offer_id": str(draft.offer_id).strip(),
        "name": str(draft.name).strip(),
        "description": str(getattr(draft, "description", "") or ""),
        "description_category_id": _positive_id(draft.description_category_id),
        "type_id": _positive_id(draft.type_id),
        "barcode": str(draft.barcode or "").strip(),
        "dimension_unit": "mm",
        "weight_unit": "g",
        "height": _positive_int(draft.height),
        "depth": _positive_int(draft.depth),
        "width": _positive_int(draft.width),
        "weight": _positive_int(draft.weight),
        "primary_image": primary_image,
        "images": valid_images,
        "price": format_ozon_price(draft.price_rub),
        "old_price": format_ozon_price(draft.old_price_rub),
        "vat": _normalize_ozon_vat(draft.vat),
        "currency_code": "RUB",
        "attributes": attributes,
        "complex_attributes": complex_attributes,
    }

    return item


def _extract_import_task_id(response: Any) -> int:
    """Extract the single task ID returned by POST /v3/product/import."""
    result = response.get("result") if isinstance(response, dict) else None
    raw_task_id = result.get("task_id") if isinstance(result, dict) else None
    try:
        task_id = int(raw_task_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("Ozon 导入响应缺少有效的 result.task_id") from exc
    if task_id <= 0:
        raise ValueError("Ozon 导入响应缺少有效的 result.task_id")
    return task_id


# ── Submit to Ozon ────────────────────────────────────────────────────

def submit_draft_to_ozon(
    db: Session,
    draft_id: int,
) -> dict:
    """提交单个草稿到 Ozon，返回 {success, task_id, error}"""
    draft = draft_crud.get_draft(db, draft_id)
    if not draft:
        raise ValueError(f"草稿 {draft_id} 不存在")

    if draft.status not in ("draft", "ready", "error"):
        raise ValueError(f"草稿状态 {draft.status} 不可提交")

    try:
        item = _build_ozon_item(draft)
    except OzonItemValidationError as exc:
        draft_crud.update_draft(db, draft_id, {
            "status": "draft",
            "readiness_errors": exc.errors,
            "error_message": str(exc),
        })
        return {"success": False, "task_id": 0, "error": str(exc)}

    store = db.query(Store).filter(Store.id == draft.store_id).first()
    if not store:
        raise ValueError(f"店铺 {draft.store_id} 不存在")

    draft_crud.update_draft(db, draft_id, {
        "status": "submitting",
        "readiness_errors": [],
        "error_message": "",
    })

    try:
        client = OzonClient(client_id=store.client_id, api_key=store.api_key)
        result = client.import_products(items=[item])
        ozon_task_id = _extract_import_task_id(result)

        draft_crud.update_draft(db, draft_id, {
            "status": "submitted",
            "ozon_task_id": ozon_task_id,
        })

        return {"success": True, "task_id": ozon_task_id, "error": ""}
    except Exception as e:
        logger.error("Submit draft %d failed: %s", draft_id, str(e))
        draft_crud.update_draft(db, draft_id, {
            "status": "error",
            "error_message": str(e),
        })
        return {"success": False, "task_id": 0, "error": str(e)}


def submit_batch_to_ozon(
    db: Session,
    draft_ids: List[int],
) -> dict:
    """批量提交草稿到 Ozon"""
    # Group by store_id for batch API efficiency
    drafts = draft_crud.get_drafts_by_ids(db, draft_ids)
    if not drafts:
        raise ValueError("未找到指定草稿")

    by_store: dict[int, list[UploadDraft]] = {}
    for d in drafts:
        by_store.setdefault(d.store_id, []).append(d)

    all_results = []
    total_submitted = 0
    total_failed = 0

    for store_id, store_drafts in by_store.items():
        store = db.query(Store).filter(Store.id == store_id).first()
        if not store:
            for d in store_drafts:
                all_results.append({"draft_id": d.id, "success": False, "task_id": 0, "error": "店铺不存在"})
                total_failed += 1
            continue

        # Validate every item before any status transition or network request.
        valid_pairs: list[tuple[UploadDraft, dict[str, Any]]] = []
        for d in store_drafts:
            if d.status not in ("draft", "ready", "error"):
                all_results.append({"draft_id": d.id, "success": False, "task_id": 0, "error": f"状态 {d.status} 不可提交"})
                total_failed += 1
                continue
            try:
                valid_pairs.append((d, _build_ozon_item(d)))
            except OzonItemValidationError as exc:
                draft_crud.update_draft(db, d.id, {
                    "status": "draft",
                    "readiness_errors": exc.errors,
                    "error_message": str(exc),
                })
                all_results.append({
                    "draft_id": d.id,
                    "success": False,
                    "task_id": 0,
                    "error": str(exc),
                })
                total_failed += 1

        if not valid_pairs:
            continue

        client = OzonClient(client_id=store.client_id, api_key=store.api_key)
        # Ozon API limits: send in chunks of 100. Isolate chunk failures so a
        # later error cannot overwrite drafts already accepted by Ozon.
        CHUNK_SIZE = 100
        for i in range(0, len(valid_pairs), CHUNK_SIZE):
            chunk_pairs = valid_pairs[i:i + CHUNK_SIZE]
            chunk_drafts = [pair[0] for pair in chunk_pairs]
            chunk = [pair[1] for pair in chunk_pairs]
            for d in chunk_drafts:
                draft_crud.update_draft(db, d.id, {
                    "status": "submitting",
                    "readiness_errors": [],
                    "error_message": "",
                })
            try:
                result = client.import_products(items=chunk)
                task_id = _extract_import_task_id(result)

                for d in chunk_drafts:
                    draft_crud.update_draft(db, d.id, {
                        "status": "submitted",
                        "ozon_task_id": task_id,
                    })
                    all_results.append({"draft_id": d.id, "success": True, "task_id": task_id, "error": ""})
                    total_submitted += 1
            except Exception as e:
                logger.error("Batch submit for store %d failed: %s", store_id, str(e))
                for d in chunk_drafts:
                    draft_crud.update_draft(db, d.id, {"status": "error", "error_message": str(e)})
                    all_results.append({"draft_id": d.id, "success": False, "task_id": 0, "error": str(e)})
                    total_failed += 1

    return {
        "total": len(draft_ids),
        "submitted": total_submitted,
        "failed": total_failed,
        "results": all_results,
    }


# ── Status tracking ───────────────────────────────────────────────────

def check_draft_status(
    db: Session,
    draft_id: int,
) -> dict:
    """查询单个草稿的 Ozon 导入状态"""
    draft = draft_crud.get_draft(db, draft_id)
    if not draft:
        raise ValueError(f"草稿 {draft_id} 不存在")

    if draft.status != "submitted" or not draft.ozon_task_id:
        return {"status": draft.status, "message": "尚未提交或无 task_id"}

    store = db.query(Store).filter(Store.id == draft.store_id).first()
    if not store:
        raise ValueError(f"店铺 {draft.store_id} 不存在")

    try:
        client = OzonClient(client_id=store.client_id, api_key=store.api_key)
        result = client.get_import_task_status(task_id=draft.ozon_task_id)

        items = result.get("items", []) if isinstance(result, dict) else []
        if items:
            item = next(
                (
                    candidate
                    for candidate in items
                    if isinstance(candidate, dict)
                    and str(candidate.get("offer_id", "")) == str(draft.offer_id)
                ),
                None,
            )
            if item is None and len(items) == 1 and isinstance(items[0], dict):
                item = items[0]
            if item is None:
                return {"status": draft.status, "message": "导入结果中未找到当前 offer_id"}
            ozon_status = item.get("status", "")
            product_id = item.get("product_id", 0)
            errors = item.get("errors", [])
            error_msg = ""
            if errors:
                error_msg = "; ".join(
                    e.get("message", str(e)) if isinstance(e, dict) else str(e)
                    for e in errors
                )

            if ozon_status in ("imported", "skipped"):
                new_status = "active"
            elif ozon_status == "pending":
                new_status = "processing"
            elif ozon_status == "failed":
                new_status = "error"
                error_msg = error_msg or f"Ozon status: {ozon_status}"
            else:
                return {"status": draft.status, "message": f"未知 Ozon status: {ozon_status}"}

            update = {
                "status": new_status,
                "ozon_last_synced_at": datetime.now(),
                "error_message": error_msg,
            }
            if product_id:
                update["ozon_product_id"] = product_id
            draft_crud.update_draft(db, draft_id, update)

            return {
                "status": new_status,
                "product_id": product_id,
                "errors": errors,
            }

        return {"status": draft.status, "message": "未获取到导入结果"}
    except Exception as e:
        logger.error("Check status failed for draft %d: %s", draft_id, str(e))
        return {"status": draft.status, "message": str(e)}


def check_batch_status(
    db: Session,
    draft_ids: List[int],
) -> List[dict]:
    """批量查询 Ozon 导入状态"""
    results = []
    for did in draft_ids:
        try:
            r = check_draft_status(db, did)
            r["draft_id"] = did
            results.append(r)
        except Exception as e:
            results.append({"draft_id": did, "status": "error", "message": str(e)})
    return results
