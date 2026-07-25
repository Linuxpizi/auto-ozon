from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


class OzonboxModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class OzonboxOpenModel(BaseModel):
    """A factual nested record whose unknown metadata must survive ingestion."""

    model_config = ConfigDict(
        populate_by_name=True,
        extra="allow",
        str_strip_whitespace=True,
    )


class FactProvenance(OzonboxOpenModel):
    source: str
    source_path: str | None = Field(default=None, alias="sourcePath")
    captured_at: str | None = Field(default=None, alias="capturedAt")
    reason: str | None = None


class PackagePhysicalSnapshot(OzonboxOpenModel):
    package_weight_g: float | None = Field(default=None, alias="packageWeightG", gt=0)
    package_depth_mm: float | None = Field(default=None, alias="packageDepthMm", gt=0)
    package_width_mm: float | None = Field(default=None, alias="packageWidthMm", gt=0)
    package_height_mm: float | None = Field(default=None, alias="packageHeightMm", gt=0)
    package_physical_provenance: dict[str, Any] | None = Field(
        default=None,
        alias="packagePhysicalProvenance",
    )


class OzonAttributeFactValue(OzonboxOpenModel):
    dictionary_value_id: int | None = Field(default=None, alias="dictionaryValueId")
    value: str | None = None


class OzonAttributeFact(OzonboxOpenModel):
    attribute_id: int = Field(alias="attributeId")
    values: list[OzonAttributeFactValue] = Field(default_factory=list)
    unit: str | None = None
    scope: Literal["product", "sku"]
    complex_group_id: str | None = Field(default=None, alias="complexGroupId")
    recognized: bool
    publishable: bool
    provenance: FactProvenance


class ProductFact(OzonboxOpenModel):
    name: str
    value: str
    source_path: str | None = Field(default=None, alias="sourcePath")
    provenance: FactProvenance | None = None


class SafeStore(OzonboxModel):
    id: int
    name: str
    store_name: str = Field(alias="storeName")
    client_id: str = Field(alias="clientId")
    status: str
    usable: bool


class CategoryResult(OzonboxModel):
    category_id: int = Field(alias="categoryId", gt=0)
    type_id: int | None = Field(default=None, alias="typeId", gt=0)
    description_category_id: int = Field(alias="descriptionCategoryId", gt=0)
    category_path: str | None = Field(default=None, alias="categoryPath")


class ProductIdList(OzonboxModel):
    product_id: list[int] = Field(min_length=1, max_length=1000)

    @field_validator("product_id")
    @classmethod
    def positive_ids(cls, values: list[int]) -> list[int]:
        if any(value <= 0 for value in values):
            raise ValueError("product_id 必须为正整数")
        return values


class ProductIdValue(OzonboxModel):
    product_id: int = Field(gt=0)


class OzonVariant(PackagePhysicalSnapshot):
    id: str | None = None
    product_id: str | None = Field(default=None, alias="productId")
    sku: str | None = None
    offer_id: str | None = Field(default=None, alias="offerId")
    price: float | None = Field(default=None, gt=0)
    old_price: float | None = Field(default=None, alias="oldPrice", gt=0)
    images: list[HttpUrl | str] = Field(default_factory=list)
    video: HttpUrl | str | None = None
    videos: list[HttpUrl | str] = Field(default_factory=list)
    weight: float | None = Field(default=None, gt=0)
    depth: float | None = Field(default=None, gt=0)
    width: float | None = Field(default=None, gt=0)
    height: float | None = Field(default=None, gt=0)
    stock: int | None = Field(default=None, ge=0)
    source_url: HttpUrl | str | None = Field(default=None, alias="sourceUrl")
    supplier_sku_id: str | None = Field(default=None, alias="supplierSkuId")
    supplier_spec_text: str | None = Field(default=None, alias="supplierSpecText")
    supplier_attrs: list[dict[str, Any]] = Field(default_factory=list, alias="supplierAttrs")
    variant_attrs: dict[str, Any] = Field(default_factory=dict, alias="variantAttrs")
    ozon_attribute_facts: list[OzonAttributeFact] = Field(
        default_factory=list,
        alias="ozonAttributeFacts",
    )

    @model_validator(mode="after")
    def require_real_identity(self) -> "OzonVariant":
        if not any((self.id, self.product_id, self.sku, self.offer_id)):
            raise ValueError("每个变体必须包含真实的 id、productId、sku 或 offerId")
        return self


class ProductRecord(OzonboxModel):
    store_id: int = Field(alias="storeId", gt=0)
    record_name: str = Field(alias="recordName", min_length=1, max_length=512)
    source: Literal["OZON"]
    source_url: HttpUrl = Field(alias="sourceUrl")
    product_id: str = Field(alias="productId", min_length=1, max_length=128)
    sku: str | None = None
    title: str = Field(min_length=1, max_length=1024)
    brand: str | None = None
    title_ru: str | None = Field(default=None, alias="titleRu")
    description: str | None = None
    description_ru: str | None = Field(default=None, alias="descriptionRu")
    tags: list[str] | str | None = None
    images: list[HttpUrl | str] = Field(default_factory=list)
    video_urls: list[HttpUrl | str] = Field(default_factory=list, alias="videoUrls")
    price: float = Field(gt=0)
    specs: list[dict[str, Any]] = Field(default_factory=list)
    text_facts: list[ProductFact] = Field(default_factory=list, alias="textFacts")
    package_facts: PackagePhysicalSnapshot | None = Field(default=None, alias="packageFacts")
    ozon_attribute_facts: list[OzonAttributeFact] = Field(
        default_factory=list,
        alias="ozonAttributeFacts",
    )
    variants: list[OzonVariant] = Field(alias="variantsData", min_length=1)
    variant_attr_ids: list[int] = Field(default_factory=list, alias="variantAttrIds")
    category_path: str | None = Field(default=None, alias="categoryPath")
    category_id: int | None = Field(default=None, alias="categoryId", gt=0)
    type_id: int | None = Field(default=None, alias="typeId", gt=0)
    description_category_id: int | None = Field(default=None, alias="descriptionCategoryId", gt=0)
    ozon_metrics: dict[str, Any] | None = Field(default=None, alias="ozonMetrics")
    warehouse: str | None = None
    warehouse_id: str | None = Field(default=None, alias="warehouseId")
    logistics_type: str | None = Field(default=None, alias="logisticsType")
    delivery_method: str | None = Field(default=None, alias="deliveryMethod")
    delivery_region: str | None = Field(default=None, alias="deliveryRegion")
    delivery_days: int | None = Field(default=None, alias="deliveryDays", ge=0)
    discount: str | None = None
    stock: str | None = None
    status: Literal["draft"] = "draft"

    @field_validator("product_id")
    @classmethod
    def positive_product_id(cls, value: str) -> str:
        if not value.isdigit() or int(value) <= 0:
            raise ValueError("productId 必须是正整数的字符串")
        return value

    @model_validator(mode="after")
    def validate_category_consistency(self) -> "ProductRecord":
        if self.category_id is not None and self.description_category_id is not None:
            if self.category_id != self.description_category_id:
                raise ValueError("categoryId 与 descriptionCategoryId 必须一致")
        return self


T = TypeVar("T")


class OzonboxEnvelope(OzonboxModel, Generic[T]):
    code: int = 200
    data: T
    message: str = "success"


class ProductRecordSaved(OzonboxModel):
    id: int
    store_id: int = Field(alias="storeId")
    product_id: str = Field(alias="productId")
    status: str


class PackageFactsQuery(OzonboxModel):
    sku: str = Field(min_length=1, max_length=256)


class PackageAttribute(OzonboxModel):
    key: Literal["9454", "9455", "9456", "4497"]
    value: str


class PackageShopFacts(OzonboxModel):
    attributes: list[PackageAttribute] = Field(default_factory=list)
    categories: list[Any] = Field(default_factory=list)