import copy
import math
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.store import Store
from app.models.upload_draft import UploadDraft
from app.schemas.panel_tools import (
    PanelListingDraftResult,
    PanelListingPrepareRequest,
    PanelPricingInput,
    PanelPricingResult,
)
from app.services.upload_service import (
    _first_present,
    _merge_attribute_facts,
    _merge_package_facts,
    _serialize_tags,
    _valid_http_urls,
    _variant_video_urls,
    draft_readiness_update,
)


def calculate_panel_pricing(inp: PanelPricingInput) -> PanelPricingResult:
    """Mirror the deterministic extension calculation for REAL mode."""
    cost_total_cny = max(0.0, inp.cost_cny + inp.shipping_cny + inp.packaging_cny)
    cost_total_rub = cost_total_cny * inp.exchange_rate
    commission_rate = min(
        0.5,
        max(0.0, (inp.ozon_commission_pct + inp.logistics_commission_pct) / 100),
    )
    denominator = max(0.5, 1 - commission_rate)

    if inp.mode == "evaluate":
        price_rub = float(inp.sale_price_rub or 0)
    else:
        price_rub = math.ceil(
            cost_total_rub * (1 + max(0.0, inp.target_margin_pct) / 100) / denominator
        )
        if inp.competitor_price_rub > 0:
            price_rub = min(price_rub, round(inp.competitor_price_rub * 0.99))
        protected_price = math.ceil(
            cost_total_rub * (1 + max(0.0, inp.min_margin_pct) / 100) / denominator
        )
        price_rub = max(price_rub, protected_price)
        if inp.min_price_rub > 0:
            price_rub = max(price_rub, inp.min_price_rub)
        if inp.max_price_rub > 0:
            price_rub = min(price_rub, inp.max_price_rub)

    commission_rub = price_rub * commission_rate
    profit_rub = price_rub - commission_rub - cost_total_rub
    margin_pct = profit_rub / cost_total_rub * 100 if cost_total_rub > 0 else 0.0
    return PanelPricingResult(
        mode=inp.mode,
        costTotalCny=cost_total_cny,
        costTotalRub=cost_total_rub,
        priceRub=price_rub,
        oldPriceRub=math.ceil(price_rub * 1.2),
        marginPct=margin_pct,
        profitRub=profit_rub,
        commissionRub=commission_rub,
        breakdown={
            "goodsCostRub": inp.cost_cny * inp.exchange_rate,
            "shippingRub": inp.shipping_cny * inp.exchange_rate,
            "packagingRub": inp.packaging_cny * inp.exchange_rate,
            "commissionRatePct": commission_rate * 100,
        },
    )


def _variant_identity(variant: Any) -> set[str]:
    return {
        str(value).strip()
        for value in (variant.id, variant.product_id, variant.sku, variant.offer_id)
        if value is not None and str(value).strip()
    }


def _json_value(value: Any, *, exclude_unset: bool = False) -> Any:
    """Convert Pydantic facts to JSON data without dropping allowed extras."""
    if hasattr(value, "model_dump"):
        return value.model_dump(
            mode="json",
            by_alias=True,
            exclude_unset=exclude_unset,
        )
    return copy.deepcopy(value)


def _json_list(values: Any, *, exclude_unset: bool = False) -> list[Any]:
    if not isinstance(values, list):
        return []
    return [_json_value(value, exclude_unset=exclude_unset) for value in values]


def _panel_tags(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    return _serialize_tags(value)


def prepare_listing_draft(
    db: Session, request: PanelListingPrepareRequest
) -> PanelListingDraftResult:
    product, inp = request.product, request.input
    store = db.query(Store).filter(Store.id == inp.store_id).first()
    if not store:
        raise HTTPException(404, "店铺不存在")
    if store.status != "active" or not store.client_id or not store.api_key:
        raise HTTPException(422, "店铺未启用或缺少 Ozon API 凭据")
    if product.store_id != inp.store_id:
        raise HTTPException(422, "input.storeId 必须与采集事实 product.storeId 一致")
    if product.product_id != inp.product_id:
        raise HTTPException(422, "input.productId 必须与采集事实 product.productId 一致")
    if str(product.source_url) != str(inp.source_url):
        raise HTTPException(422, "input.sourceUrl 必须与采集事实 product.sourceUrl 一致")

    unsupported = [
        label
        for enabled, label in (
            (inp.watermark_enabled, "watermarkEnabled"),
            (inp.randomize_images, "randomizeImages"),
            (inp.model_images_enabled, "modelImagesEnabled"),
            (inp.floating_price_enabled, "floatingPriceEnabled"),
        )
        if enabled
    ]
    if unsupported:
        raise HTTPException(422, f"REAL 模式暂不支持转换: {', '.join(unsupported)}")

    selected = [variant for variant in inp.variants if variant.selected]
    if not selected:
        raise HTTPException(422, "至少选择一个变体")
    product_identities = set().union(*(_variant_identity(row) for row in product.variants))
    unknown_skus = [row.sku for row in selected if row.sku not in product_identities]
    if unknown_skus:
        raise HTTPException(422, f"所选变体不是采集事实中的真实变体: {', '.join(unknown_skus)}")

    primary = selected[0]
    factual_variant = next(
        row for row in product.variants if primary.sku in _variant_identity(row)
    )
    editable_snapshot = primary.model_dump(mode="json", by_alias=True)
    # exclude_unset is intentional: an explicitly collected empty video list owns
    # emptiness, while an omitted video field may still fall back to product media.
    factual_snapshot = factual_variant.model_dump(
        mode="json",
        by_alias=True,
        exclude_unset=True,
    )
    selected_snapshot = {
        **copy.deepcopy(factual_snapshot),
        **copy.deepcopy(editable_snapshot),
        "selectionIdentity": primary.sku,
        "editableSkuSnapshot": copy.deepcopy(editable_snapshot),
        "variantSnapshot": copy.deepcopy(factual_snapshot),
    }
    product_package = (
        _json_value(product.package_facts, exclude_unset=True)
        if product.package_facts is not None
        else None
    )
    package_scalars, package_facts = _merge_package_facts(
        factual_snapshot,
        product_package,
        product.ozon_metrics,
    )
    product_attribute_facts = _json_list(product.ozon_attribute_facts)
    variant_attribute_facts = _first_present(
        factual_snapshot,
        ("ozonAttributeFacts", "ozon_attribute_facts"),
    )
    attribute_facts = _merge_attribute_facts(
        product_attribute_facts,
        variant_attribute_facts,
    )
    variant_owns_videos, selected_videos = _variant_video_urls(factual_snapshot)
    video_urls = (
        selected_videos
        if variant_owns_videos
        else _valid_http_urls([str(value) for value in product.video_urls])
    )
    images = _valid_http_urls(
        [
            str(value)
            for value in (primary.images if inp.follow_source_images else product.images)
        ]
    )
    warnings: list[str] = []
    if len(selected) > 1:
        warnings.append("当前 UploadDraft 仅提交一个商品；已保留全部所选变体事实，首个变体驱动当前草稿")
    if any(value is None for value in package_scalars.values()):
        warnings.append(
            "采集事实缺少完整包装尺寸/重量，补充有来源的包装数据或人工测量并填写修改原因后才能提交"
        )
    if not images:
        warnings.append("所选图片中没有有效 HTTP(S) URL")

    variants_json = _json_list(product.variants)
    draft = (
        db.query(UploadDraft)
        .filter(
            UploadDraft.store_id == inp.store_id,
            UploadDraft.source_type == "panel",
            UploadDraft.source_product_key == product.product_id,
        )
        .first()
    )
    if draft is None:
        draft = UploadDraft(
            store_id=inp.store_id,
            source_type="panel",
            source_product_key=product.product_id,
        )
        db.add(draft)

    draft.source_sku = primary.sku
    draft.source_name = product.title
    draft.source_url = str(product.source_url)
    draft.source_images = [str(value) for value in product.images]
    draft.description_category_id = inp.description_category_id
    draft.type_id = inp.type_id
    draft.category_name = inp.category_name
    draft.offer_id = inp.offer_id
    draft.name = inp.title
    draft.description = product.description_ru or product.description or ""
    draft.price_rub = primary.price_rub
    draft.old_price_rub = primary.old_price_rub
    draft.primary_image = images[0] if images else ""
    draft.images = images[:15]
    draft.barcode = str(_first_present(factual_snapshot, ("barcode",)) or "").strip()
    # Explicit assignment (including None) prevents a repeated prepare from
    # retaining stale dimensions. Factual refresh also invalidates old manual
    # audits, which must never authorize a newly absent package value.
    for field, value in package_scalars.items():
        setattr(draft, field, value)
    draft.selected_sku_snapshot = selected_snapshot
    draft.package_facts = package_facts or None
    draft.package_override_audit = None
    draft.ozon_attribute_facts = attribute_facts or None
    draft.video_urls = video_urls or None
    draft.text_facts = _json_list(product.text_facts) or None
    draft.ozon_metrics = copy.deepcopy(product.ozon_metrics)
    draft.ozonbox_record_name = product.record_name
    draft.ozonbox_product_id = product.product_id
    draft.ozonbox_source_url = str(product.source_url)
    draft.ozonbox_sku = product.sku
    draft.ozonbox_title = product.title
    draft.ozonbox_title_ru = product.title_ru
    draft.ozonbox_description = product.description
    draft.ozonbox_description_ru = product.description_ru
    draft.ozonbox_tags = _panel_tags(product.tags)
    draft.ozonbox_images = [str(value) for value in product.images]
    draft.ozonbox_price = product.price
    draft.ozonbox_specs = product.specs
    draft.ozonbox_variants = variants_json
    draft.ozonbox_variant_attr_ids = product.variant_attr_ids
    draft.ozonbox_category_path = product.category_path
    draft.ozonbox_category_id = product.category_id
    draft.ozonbox_type_id = product.type_id
    draft.ozonbox_description_category_id = product.description_category_id
    readiness = draft_readiness_update(draft)
    draft.status = readiness["status"]
    draft.readiness_errors = readiness["readiness_errors"]
    draft.error_message = readiness["error_message"]
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "同一店铺商品草稿发生并发冲突")
    db.refresh(draft)
    return PanelListingDraftResult(
        draftId=draft.id,
        status=draft.status,
        offerId=draft.offer_id,
        selectedVariantCount=len(selected),
        warnings=warnings,
    )