from typing import Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from sqlalchemy.exc import IntegrityError
from app.models.upload_draft import UploadDraft
from app.schemas.upload_draft import UploadDraftBase


def get_draft(db: Session, draft_id: int) -> Optional[UploadDraft]:
    return db.query(UploadDraft).filter(UploadDraft.id == draft_id).first()


def get_drafts(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    keyword: Optional[str] = None,
) -> list[UploadDraft]:
    q = db.query(UploadDraft)
    if store_id is not None:
        q = q.filter(UploadDraft.store_id == store_id)
    if status:
        q = q.filter(UploadDraft.status == status)
    if source_type:
        q = q.filter(UploadDraft.source_type == source_type)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            UploadDraft.name.ilike(like)
            | UploadDraft.offer_id.ilike(like)
            | UploadDraft.source_name.ilike(like)
            | UploadDraft.source_sku.ilike(like)
        )
    return q.order_by(UploadDraft.id.desc()).offset(skip).limit(limit).all()


def count_drafts(
    db: Session,
    store_id: Optional[int] = None,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    keyword: Optional[str] = None,
) -> int:
    q = db.query(sa_func.count(UploadDraft.id))
    if store_id is not None:
        q = q.filter(UploadDraft.store_id == store_id)
    if status:
        q = q.filter(UploadDraft.status == status)
    if source_type:
        q = q.filter(UploadDraft.source_type == source_type)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(
            UploadDraft.name.ilike(like)
            | UploadDraft.offer_id.ilike(like)
            | UploadDraft.source_name.ilike(like)
            | UploadDraft.source_sku.ilike(like)
        )
    return q.scalar() or 0


def create_draft(db: Session, data: dict) -> UploadDraft:
    obj = UploadDraft(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_draft(db: Session, draft_id: int, data: dict) -> Optional[UploadDraft]:
    obj = get_draft(db, draft_id)
    if not obj:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_draft(db: Session, draft_id: int) -> bool:
    obj = get_draft(db, draft_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def bulk_delete_drafts(db: Session, ids: list[int]) -> int:
    count = db.query(UploadDraft).filter(UploadDraft.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return count


def get_drafts_by_ids(db: Session, ids: list[int]) -> list[UploadDraft]:
    return db.query(UploadDraft).filter(UploadDraft.id.in_(ids)).all()


def get_drafts_by_store_and_status(db: Session, store_id: int, status: str) -> list[UploadDraft]:
    return (
        db.query(UploadDraft)
        .filter(UploadDraft.store_id == store_id, UploadDraft.status == status)
        .all()
    )


def _apply_ozonbox_facts(obj: UploadDraft, data: dict) -> None:
    """Apply the complete collected fact snapshot, including explicit nulls."""
    for key, value in data.items():
        setattr(obj, key, value)


def upsert_ozonbox_product_record(db: Session, data: dict) -> UploadDraft:
    """Idempotently save one Ozonbox product using its real productId.

    Every value is assigned, including ``None``.  This is intentional: a later
    collection may establish that an optional fact is absent and must be able
    to clear a previous value rather than silently retaining stale data.
    """
    key_filter = (
        UploadDraft.store_id == data["store_id"],
        UploadDraft.source_type == "ozonbox",
        UploadDraft.source_product_key == data["source_product_key"],
    )
    obj = db.query(UploadDraft).filter(*key_filter).first()
    try:
        if obj is None:
            obj = UploadDraft(source_type="ozonbox", **data)
            db.add(obj)
            # Legacy client-side Column defaults are applied during INSERT,
            # even when the constructor receives None. Flush first, then
            # replay the complete facts so absent values become SQL NULL.
            db.flush()

        _apply_ozonbox_facts(obj, data)
        db.commit()
    except IntegrityError:
        # A second request can race the first INSERT. Re-read the unique fact
        # row and apply this request's complete snapshot instead of discarding
        # it or retaining stale optional values.
        db.rollback()
        obj = db.query(UploadDraft).filter(*key_filter).one()
        _apply_ozonbox_facts(obj, data)
        db.commit()
    db.refresh(obj)
    return obj


def _positive_number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        return None
    return float(value)


def _variant_identity_matches(variant: dict[str, Any], identity: str) -> bool:
    return any(
        str(variant.get(key) or "") == identity
        for key in ("product_id", "productId", "sku", "offer_id", "offerId", "id")
    )


def _record_identity_rank(record: UploadDraft, identity: str) -> int | None:
    if identity in {
        str(record.source_product_key or ""),
        str(record.ozonbox_product_id or ""),
    }:
        return 0
    if identity == str(record.ozonbox_sku or ""):
        return 1
    variants = record.ozonbox_variants
    if isinstance(variants, list) and any(
        isinstance(variant, dict) and _variant_identity_matches(variant, identity)
        for variant in variants
    ):
        return 2
    return None


def _matching_variants(
    record: UploadDraft, identity: str, record_rank: int
) -> list[dict[str, Any]]:
    variants = record.ozonbox_variants
    if not isinstance(variants, list):
        return []
    valid_variants = [variant for variant in variants if isinstance(variant, dict)]
    explicit_matches = [
        variant for variant in valid_variants if _variant_identity_matches(variant, identity)
    ]
    if explicit_matches:
        return explicit_matches
    # A top-level SKU can identify a single-variant product even when the
    # collector did not duplicate that SKU inside the variant JSON.  Never pick
    # one variant from a multi-variant record without an explicit identity.
    if record_rank == 1 and len(valid_variants) == 1:
        return valid_variants
    return []


def _package_attributes(variant: dict[str, Any]) -> list[dict[str, str]]:
    depth = _positive_number(variant.get("depth"))
    width = _positive_number(variant.get("width"))
    height = _positive_number(variant.get("height"))
    weight = _positive_number(variant.get("weight"))
    attributes: list[dict[str, str]] = []
    if depth is not None and width is not None and height is not None:
        attributes.extend(
            [
                {"key": "9454", "value": str(depth).removesuffix(".0")},
                {"key": "9455", "value": str(width).removesuffix(".0")},
                {"key": "9456", "value": str(height).removesuffix(".0")},
            ]
        )
    if weight is not None:
        attributes.append({"key": "4497", "value": str(weight).removesuffix(".0")})
    return attributes


def get_ozonbox_package_attributes(db: Session, identity: str) -> list[dict[str, str]]:
    """Read package facts from current Ozonbox JSON without legacy defaults.

    Identity precedence is source product, top-level SKU, then variant identity.
    Within the strongest matching tier, prefer a complete dimensions+weight fact
    set and then the newest row. Partial dimensions are never returned.
    """
    records = (
        db.query(UploadDraft)
        .filter(UploadDraft.source_type == "ozonbox")
        .order_by(UploadDraft.id.desc())
        .all()
    )
    candidates: list[tuple[int, int, int, list[dict[str, str]]]] = []
    for record in records:
        record_rank = _record_identity_rank(record, identity)
        if record_rank is None:
            continue
        for variant in _matching_variants(record, identity, record_rank):
            attributes = _package_attributes(variant)
            if not attributes:
                continue
            completeness_rank = 0 if len(attributes) == 4 else 1
            candidates.append((record_rank, completeness_rank, -record.id, attributes))
    if not candidates:
        return []
    candidates.sort(key=lambda candidate: candidate[:3])
    return candidates[0][3]
