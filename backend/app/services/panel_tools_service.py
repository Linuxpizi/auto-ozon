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


def _http_images(values: list[Any]) -> list[str]:
    return [
        str(value).strip()
        for value in values
        if str(value).strip().startswith(("http://", "https://"))
    ]


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
    images = _http_images(primary.images if inp.follow_source_images else product.images)
    warnings: list[str] = []
    if len(selected) > 1:
        warnings.append("当前 UploadDraft 仅提交一个商品；已保留全部所选变体事实，首个变体驱动当前草稿")
    dimensions = {
        "weight": factual_variant.weight,
        "height": factual_variant.height,
        "depth": factual_variant.depth,
        "width": factual_variant.width,
    }
    if any(value is None for value in dimensions.values()):
        warnings.append("采集事实缺少完整包裹尺寸/重量；提交管线的默认值仍需人工复核")
    if not images:
        warnings.append("所选图片中没有有效 HTTP(S) URL")

    variants_json = [row.model_dump(mode="json", by_alias=False) for row in product.variants]
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
    draft.status = "ready"
    draft.error_message = ""
    for field, value in dimensions.items():
        if value is not None:
            setattr(draft, field, max(1, round(value)))
    draft.ozonbox_record_name = product.record_name
    draft.ozonbox_product_id = product.product_id
    draft.ozonbox_source_url = str(product.source_url)
    draft.ozonbox_sku = product.sku
    draft.ozonbox_title = product.title
    draft.ozonbox_title_ru = product.title_ru
    draft.ozonbox_description = product.description
    draft.ozonbox_description_ru = product.description_ru
    draft.ozonbox_tags = product.tags
    draft.ozonbox_images = [str(value) for value in product.images]
    draft.ozonbox_price = product.price
    draft.ozonbox_specs = product.specs
    draft.ozonbox_variants = variants_json
    draft.ozonbox_variant_attr_ids = product.variant_attr_ids
    draft.ozonbox_category_path = product.category_path
    draft.ozonbox_category_id = product.category_id
    draft.ozonbox_type_id = product.type_id
    draft.ozonbox_description_category_id = product.description_category_id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "同一店铺商品草稿发生并发冲突")
    db.refresh(draft)
    return PanelListingDraftResult(
        draftId=draft.id,
        status="ready",
        offerId=draft.offer_id,
        selectedVariantCount=len(selected),
        warnings=warnings,
    )