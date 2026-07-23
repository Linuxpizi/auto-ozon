import math
import re
from typing import Literal

from pydantic import Field, HttpUrl, field_validator, model_validator

from app.schemas.ozonbox import OzonboxModel, ProductRecord


class PanelPricingInput(OzonboxModel):
    mode: Literal["suggest", "evaluate"]
    cost_cny: float = Field(alias="costCny", ge=0)
    shipping_cny: float = Field(alias="shippingCny", ge=0)
    packaging_cny: float = Field(alias="packagingCny", ge=0)
    exchange_rate: float = Field(alias="exchangeRate", gt=0)
    ozon_commission_pct: float = Field(alias="ozonCommissionPct", ge=0, le=50)
    logistics_commission_pct: float = Field(alias="logisticsCommissionPct", ge=0, le=50)
    target_margin_pct: float = Field(alias="targetMarginPct", ge=0)
    min_margin_pct: float = Field(alias="minMarginPct", ge=0)
    competitor_price_rub: float = Field(alias="competitorPriceRub", ge=0)
    min_price_rub: float = Field(alias="minPriceRub", ge=0)
    max_price_rub: float = Field(alias="maxPriceRub", ge=0)
    sale_price_rub: float | None = Field(default=None, alias="salePriceRub", gt=0)

    @model_validator(mode="after")
    def validate_pricing_bounds(self) -> "PanelPricingInput":
        if self.mode == "evaluate" and self.sale_price_rub is None:
            raise ValueError("evaluate 模式必须提供正数 salePriceRub")
        if self.max_price_rub and self.min_price_rub > self.max_price_rub:
            raise ValueError("minPriceRub 不能大于 maxPriceRub")
        if self.ozon_commission_pct + self.logistics_commission_pct > 50:
            raise ValueError("总佣金比例不能超过 50%")
        return self


class PanelPricingResult(OzonboxModel):
    mode: Literal["suggest", "evaluate"]
    cost_total_cny: float = Field(alias="costTotalCny")
    cost_total_rub: float = Field(alias="costTotalRub")
    price_rub: float = Field(alias="priceRub")
    old_price_rub: float = Field(alias="oldPriceRub")
    margin_pct: float = Field(alias="marginPct")
    profit_rub: float = Field(alias="profitRub")
    commission_rub: float = Field(alias="commissionRub")
    breakdown: dict[str, float]


class PanelSelectionConditions(OzonboxModel):
    brand_option: Literal[0, 1, 2] = Field(alias="brandOption")
    sold_count_min: float | None = Field(default=None, alias="soldCountMin", ge=0)
    sold_count_max: float | None = Field(default=None, alias="soldCountMax", ge=0)
    sold_sum_min: float | None = Field(default=None, alias="soldSumMin", ge=0)
    sold_sum_max: float | None = Field(default=None, alias="soldSumMax", ge=0)
    price_min: float | None = Field(default=None, alias="priceMin", ge=0)
    price_max: float | None = Field(default=None, alias="priceMax", ge=0)
    weight_min: float | None = Field(default=None, alias="weightMin", ge=0)
    weight_max: float | None = Field(default=None, alias="weightMax", ge=0)
    listed_days_min: float | None = Field(default=None, alias="listedDaysMin", ge=0)
    listed_days_max: float | None = Field(default=None, alias="listedDaysMax", ge=0)
    sales_dynamics_min: float | None = Field(default=None, alias="salesDynamicsMin", ge=0, le=100)
    sales_dynamics_max: float | None = Field(default=None, alias="salesDynamicsMax", ge=0, le=1000)
    drr_min: float | None = Field(default=None, alias="drrMin", ge=0, le=100)
    drr_max: float | None = Field(default=None, alias="drrMax", ge=0, le=100)
    days_in_promo_min: float | None = Field(default=None, alias="daysInPromoMin", ge=0)
    days_in_promo_max: float | None = Field(default=None, alias="daysInPromoMax", ge=0)
    discount_min: float | None = Field(default=None, alias="discountMin", ge=0, le=100)
    discount_max: float | None = Field(default=None, alias="discountMax", ge=0, le=100)
    promo_revenue_share_min: float | None = Field(default=None, alias="promoRevenueShareMin", ge=0, le=100)
    promo_revenue_share_max: float | None = Field(default=None, alias="promoRevenueShareMax", ge=0, le=100)
    days_with_trafarets_min: float | None = Field(default=None, alias="daysWithTrafaretsMin", ge=0)
    days_with_trafarets_max: float | None = Field(default=None, alias="daysWithTrafaretsMax", ge=0)
    qty_view_pdp_min: float | None = Field(default=None, alias="qtyViewPdpMin", ge=0)
    qty_view_pdp_max: float | None = Field(default=None, alias="qtyViewPdpMax", ge=0)
    conv_to_cart_pdp_min: float | None = Field(default=None, alias="convToCartPdpMin", ge=0, le=100)
    conv_to_cart_pdp_max: float | None = Field(default=None, alias="convToCartPdpMax", ge=0, le=100)
    session_count_search_min: float | None = Field(default=None, alias="sessionCountSearchMin", ge=0)
    session_count_search_max: float | None = Field(default=None, alias="sessionCountSearchMax", ge=0)
    conv_to_cart_search_min: float | None = Field(default=None, alias="convToCartSearchMin", ge=0, le=100)
    conv_to_cart_search_max: float | None = Field(default=None, alias="convToCartSearchMax", ge=0, le=100)
    conv_view_to_order_min: float | None = Field(default=None, alias="convViewToOrderMin", ge=0, le=100)
    conv_view_to_order_max: float | None = Field(default=None, alias="convViewToOrderMax", ge=0, le=100)
    sales_schema: Literal["", "FBO", "FBS"] | None = Field(default=None, alias="salesSchema")
    cancel_rate_min: float | None = Field(default=None, alias="cancelRateMin", ge=0, le=100)
    cancel_rate_max: float | None = Field(default=None, alias="cancelRateMax", ge=0, le=100)
    seller_count_min: float | None = Field(default=None, alias="sellerCountMin", ge=0, le=2000)
    seller_count_max: float | None = Field(default=None, alias="sellerCountMax", ge=0, le=2000)
    minimum_price_follow_min: float | None = Field(default=None, alias="minimumPriceFollowMin", ge=0)
    minimum_price_follow_max: float | None = Field(default=None, alias="minimumPriceFollowMax", ge=0)

    @model_validator(mode="after")
    def validate_finite_ranges(self) -> "PanelSelectionConditions":
        values = self.model_dump(by_alias=False)
        for key, value in values.items():
            if key in {"brand_option", "sales_schema"} or value is None:
                continue
            if not math.isfinite(value):
                raise ValueError(f"{key} 必须是有限数值")
        for key, minimum in values.items():
            if not key.endswith("_min") or minimum is None:
                continue
            maximum = values.get(f"{key[:-4]}_max")
            if maximum is not None and minimum > maximum:
                raise ValueError(f"{key} 不能大于对应最大值")
        return self


class PanelSelectionRuleInput(OzonboxModel):
    name: str = Field(min_length=1, max_length=15)
    tag: str = Field(min_length=1, max_length=6)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    auto_favorite: bool = Field(alias="autoFavorite")
    sort: int = Field(ge=0, le=100)
    enabled: bool
    conditions: PanelSelectionConditions

    @field_validator("name", "tag")
    @classmethod
    def reject_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("字段不能为空")
        return value


class PanelSelectionRule(PanelSelectionRuleInput):
    id: int
    updated_at: str = Field(alias="updatedAt")


class PanelSelectionToggle(OzonboxModel):
    enabled: bool


class PanelDeleted(OzonboxModel):
    deleted: Literal[True] = True


class PanelListingVariant(OzonboxModel):
    sku: str = Field(min_length=1, max_length=256)
    name: str = Field(min_length=1, max_length=512)
    price_rub: float = Field(alias="priceRub", gt=0)
    old_price_rub: float = Field(alias="oldPriceRub", ge=0)
    images: list[HttpUrl | str] = Field(default_factory=list)
    selected: bool


class PanelListingDraftInput(OzonboxModel):
    store_id: int = Field(alias="storeId", gt=0)
    product_id: str = Field(alias="productId", min_length=1, max_length=128)
    source_url: HttpUrl = Field(alias="sourceUrl")
    title: str = Field(min_length=1, max_length=512)
    brand: str | None = Field(default=None, max_length=256)
    offer_id: str = Field(alias="offerId", min_length=1, max_length=128)
    description_category_id: int = Field(alias="descriptionCategoryId", gt=0)
    type_id: int = Field(alias="typeId", gt=0)
    category_name: str = Field(alias="categoryName", max_length=256)
    variants: list[PanelListingVariant] = Field(min_length=1)
    follow_source_images: bool = Field(alias="followSourceImages")
    watermark_enabled: bool = Field(alias="watermarkEnabled")
    randomize_images: bool = Field(alias="randomizeImages")
    model_images_enabled: bool = Field(alias="modelImagesEnabled")
    floating_price_enabled: bool = Field(alias="floatingPriceEnabled")


class PanelListingPrepareRequest(OzonboxModel):
    product: ProductRecord
    input: PanelListingDraftInput


class PanelListingDraftResult(OzonboxModel):
    draft_id: int = Field(alias="draftId")
    status: Literal["draft", "ready"]
    offer_id: str = Field(alias="offerId")
    selected_variant_count: int = Field(alias="selectedVariantCount")
    warnings: list[str]