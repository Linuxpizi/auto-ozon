from app.models.scraped_product import ScrapedProductRecord
from app.models.upload_draft import UploadDraft
from app.schemas.upload_draft import CreateDraftRequest, UpdateDraftRequest, UploadDraftRead
import pytest

from app.services.upload_service import (
    OzonItemValidationError,
    _build_ozon_item,
    create_draft_from_scraped,
    get_draft_readiness_errors,
)


def _record(**overrides) -> ScrapedProductRecord:
    data = {
        "platform": "1688",
        "source_id": "PRODUCT-1",
        "title": "Product title",
        "price": 10.0,
        "category": "Source category",
        "images": ["https://top.example/main.jpg"],
        "sku_list": [],
    }
    data.update(overrides)
    return ScrapedProductRecord(**data)


def _save_record(test_db, record: ScrapedProductRecord) -> ScrapedProductRecord:
    test_db.add(record)
    test_db.commit()
    test_db.refresh(record)
    return record


def _ready_draft(**overrides) -> UploadDraft:
    package_facts = {
        "packageWeightG": 321,
        "packageDepthMm": 410,
        "packageWidthMm": 220,
        "packageHeightMm": 130,
        "packagePhysicalProvenance": {
            "packageWeightG": {"source": "seller_exact_sku"},
            "packageDepthMm": {"source": "seller_exact_sku"},
            "packageWidthMm": {"source": "seller_exact_sku"},
            "packageHeightMm": {"source": "seller_exact_sku"},
        },
    }
    data = {
        "store_id": 1,
        "offer_id": "OFFER-1",
        "barcode": "4601234567890",
        "name": "Draft title",
        "description": "Exact description",
        "primary_image": "https://sku.example/primary.jpg",
        "images": [
            "https://sku.example/other.jpg",
            "https://sku.example/primary.jpg",
            "https://sku.example/other.jpg",
            "invalid",
        ],
        "description_category_id": 100,
        "type_id": 200,
        "price_rub": 123.45,
        "old_price_rub": 150.01,
        "vat": "0.2",
        "weight": 321,
        "depth": 410,
        "width": 220,
        "height": 130,
        "package_facts": package_facts,
    }
    data.update(overrides)
    return UploadDraft(**data)


def test_selected_sku_fields_are_used_for_draft(test_db):
    record = _save_record(
        test_db,
        _record(
            sku_list=[
                {
                    "sku": " SKU-2 ",
                    "name": " Selected title ",
                    "price": "22,5",
                    "oldPrice": "30,01",
                    "barcode": " 4601234567890 ",
                    "images": [
                        " https://sku.example/1.jpg ",
                        "invalid",
                        "http://sku.example/2.jpg",
                    ],
                }
            ]
        ),
    )

    draft = create_draft_from_scraped(
        test_db,
        store_id=1,
        source_product_id=record.id,
        source_sku="SKU-2",
    )

    assert draft.source_sku == "SKU-2"
    assert draft.source_name == "Selected title"
    assert draft.name == "Selected title"
    assert draft.price_cny == 22.5
    assert draft.old_price_rub == 30.01
    assert draft.barcode == "4601234567890"
    assert draft.source_images == [
        "https://sku.example/1.jpg",
        "http://sku.example/2.jpg",
    ]
    assert draft.images == draft.source_images
    assert draft.primary_image == "https://sku.example/1.jpg"
    assert draft.offer_id.startswith("SKU-2-")


def test_explicit_empty_sku_images_are_not_repopulated(test_db):
    record = _save_record(
        test_db,
        _record(
            sku_list=[
                {
                    "sku": "SKU-EMPTY",
                    "name": "Empty gallery",
                    "price": 12,
                    "images": [],
                }
            ]
        ),
    )

    draft = create_draft_from_scraped(
        test_db,
        store_id=1,
        source_product_id=record.id,
        source_sku="SKU-EMPTY",
    )

    assert draft.source_images == []
    assert draft.images == []
    assert draft.primary_image == ""


def test_legacy_sku_without_images_uses_product_gallery(test_db):
    record = _save_record(
        test_db,
        _record(
            sku_list=[
                {
                    "sku": "SKU-LEGACY",
                    "name": "Legacy row",
                    "price": 15,
                }
            ]
        ),
    )

    draft = create_draft_from_scraped(
        test_db,
        store_id=1,
        source_product_id=record.id,
        source_sku=" SKU-LEGACY ",
    )

    assert draft.source_images == ["https://top.example/main.jpg"]
    assert draft.images == ["https://top.example/main.jpg"]
    assert draft.primary_image == "https://top.example/main.jpg"


def test_unknown_sku_falls_back_to_product_identity_and_fields(test_db):
    record = _save_record(
        test_db,
        _record(
            sku_list=[
                {
                    "sku": "KNOWN",
                    "name": "Known row",
                    "price": 99,
                    "images": ["https://sku.example/known.jpg"],
                }
            ]
        ),
    )

    draft = create_draft_from_scraped(
        test_db,
        store_id=1,
        source_product_id=record.id,
        source_sku="UNKNOWN",
    )

    assert draft.source_sku == "PRODUCT-1"
    assert draft.source_name == "Product title"
    assert draft.name == "Product title"
    assert draft.price_cny == 10.0
    assert draft.barcode == ""
    assert draft.images == ["https://top.example/main.jpg"]
    assert draft.offer_id.startswith("PRODUCT-1-")


def test_selection_tags_are_copied_to_local_draft_metadata(test_db):
    record = _save_record(
        test_db,
        _record(tags=[" Summer ", "Outdoor", "outdoor", "", "Travel"]),
    )

    draft = create_draft_from_scraped(
        test_db,
        store_id=1,
        source_product_id=record.id,
    )

    assert draft.ozonbox_tags == "Summer, Outdoor, Travel"


def test_create_update_and_read_schemas_include_draft_metadata():
    request = CreateDraftRequest(
        store_id=1,
        source_product_id=2,
        source_sku="SKU-API",
    )
    assert request.source_sku == "SKU-API"

    read = UploadDraftRead.model_validate(
        {
            "id": 3,
            "store_id": 1,
            "source_sku": "SKU-API",
            "barcode": "BARCODE-API",
            "ozonbox_tags": "Summer, Outdoor",
        }
    )
    assert read.source_sku == "SKU-API"
    assert read.barcode == "BARCODE-API"
    assert read.ozonbox_tags == "Summer, Outdoor"

    update = UpdateDraftRequest(ozonbox_tags="Travel")
    assert update.model_dump(exclude_unset=True) == {"ozonbox_tags": "Travel"}


def test_ozon_item_exact_request_uses_only_listing_fields():
    draft = _ready_draft(
        ozonbox_tags="Summer, Outdoor",
        text_facts=[{"name": "Material", "value": "Steel", "attributeId": 9999}],
        ozon_metrics={"lengthMm": 999, "weightG": 888},
        video_urls=["https://video.example/collected.mp4"],
        ozon_attribute_facts=[
            {
                "attributeId": 10,
                "scope": "product",
                "recognized": True,
                "publishable": True,
                "values": [
                    {"dictionaryValueId": 7, "value": "Blue"},
                    {"dictionaryValueId": 7, "value": "Blue"},
                ],
            },
            {
                "attributeId": 20,
                "recognized": True,
                "publishable": True,
                "complexGroupId": 300,
                "values": [{"value": "Part A"}],
            },
            {
                "attributeId": 21,
                "recognized": True,
                "publishable": True,
                "complexGroupId": 300,
                "values": [{"dictionary_value_id": 8, "value": "Part B"}],
            },
            {
                "attributeId": 30,
                "recognized": True,
                "publishable": True,
                "complexGroupId": "opaque-group",
                "values": [{"value": True}],
            },
            {"attributeId": 40, "recognized": False, "publishable": True, "values": [{"value": "skip"}]},
            {"attributeId": 41, "recognized": True, "publishable": False, "values": [{"value": "skip"}]},
            {"attributeId": 0, "recognized": True, "publishable": True, "values": [{"value": "skip"}]},
            {"name": "Text-only", "recognized": True, "publishable": True, "values": [{"value": "skip"}]},
            {"attributeId": 42, "recognized": "true", "publishable": True, "values": [{"value": "skip"}]},
            {"attributeId": 43, "recognized": True, "publishable": True, "values": [{"value": {"nested": "skip"}}]},
        ],
    )

    item = _build_ozon_item(draft)

    assert item == {
        "offer_id": "OFFER-1",
        "name": "Draft title",
        "description": "Exact description",
        "description_category_id": 100,
        "type_id": 200,
        "barcode": "4601234567890",
        "dimension_unit": "mm",
        "weight_unit": "g",
        "height": 130,
        "depth": 410,
        "width": 220,
        "weight": 321,
        "primary_image": "https://sku.example/primary.jpg",
        "images": [
            "https://sku.example/primary.jpg",
            "https://sku.example/other.jpg",
        ],
        "price": "12345",
        "old_price": "15001",
        "vat": "0.2",
        "currency_code": "RUB",
        "attributes": [
            {
                "id": 10,
                "complex_id": 0,
                "values": [{"dictionary_value_id": 7, "value": "Blue"}],
            }
        ],
        "complex_attributes": [
            {
                "attributes": [
                    {
                        "id": 20,
                        "complex_id": 300,
                        "values": [{"dictionary_value_id": 0, "value": "Part A"}],
                    },
                    {
                        "id": 21,
                        "complex_id": 300,
                        "values": [{"dictionary_value_id": 8, "value": "Part B"}],
                    },
                ]
            },
            {
                "attributes": [
                    {
                        "id": 30,
                        "complex_id": 0,
                        "values": [{"dictionary_value_id": 0, "value": "true"}],
                    }
                ]
            },
        ],
    }


def test_package_merge_is_field_by_field_and_ignores_item_metrics(test_db):
    record = _save_record(
        test_db,
        _record(
            selected_sku="SKU-FACT",
            sku_list=[{"sku": "SKU-FACT", "price": 20}],
            package_facts={
                "packageWeightG": 700,
                "packageDepthMm": 710,
                "packageWidthMm": 720,
                "packageHeightMm": 730,
                "packagePhysicalProvenance": {
                    "packageWeightG": {"source": "product"},
                    "packageDepthMm": {"source": "product"},
                    "packageWidthMm": {"source": "product"},
                    "packageHeightMm": {"source": "product"},
                },
            },
            ozon_metrics={
                "lengthMm": 9999,
                "weightG": 9998,
                "packageWeightG": 800,
                "packageLengthMm": 810,
                "packageWidthMm": 820,
                "packageHeightMm": 830,
            },
            variants=[
                {
                    "sku": "SKU-FACT",
                    "packageWeightG": 600,
                    "packageWidthMm": 620,
                    "packagePhysicalProvenance": {
                        "packageWeightG": {"source": "selected"},
                        "packageWidthMm": {"source": "selected"},
                    },
                    # Legacy item-ish fields must never become package values.
                    "weight": 1,
                    "depth": 2,
                    "width": 3,
                    "height": 4,
                }
            ],
        ),
    )

    draft = create_draft_from_scraped(
        test_db,
        store_id=1,
        source_product_id=record.id,
        source_sku="SKU-FACT",
    )

    assert (draft.weight, draft.depth, draft.width, draft.height) == (600, 710, 620, 730)
    assert draft.package_facts == {
        "packageWeightG": 600,
        "packageDepthMm": 710,
        "packageWidthMm": 620,
        "packageHeightMm": 730,
        "packagePhysicalProvenance": {
            "packageWeightG": {"source": "selected"},
            "packageDepthMm": {"source": "product"},
            "packageWidthMm": {"source": "selected"},
            "packageHeightMm": {"source": "product"},
        },
    }


def test_package_only_metrics_fill_missing_fields_and_item_metrics_are_ignored(test_db):
    record = _save_record(
        test_db,
        _record(
            ozon_metrics={
                "lengthMm": 9999,
                "widthMm": 9998,
                "heightMm": 9997,
                "weightG": 9996,
                "packageWeightG": 501,
                "packageLengthMm": 502,
                "packageWidthMm": 503,
                "packageHeightMm": 504,
            }
        ),
    )

    draft = create_draft_from_scraped(test_db, store_id=1, source_product_id=record.id)

    assert (draft.weight, draft.depth, draft.width, draft.height) == (501, 502, 503, 504)
    assert draft.package_facts["packagePhysicalProvenance"]["packageDepthMm"] == {
        "source": "ozon_metrics_package",
        "sourcePath": "ozonMetrics.packageDepthMm",
    }


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("weight", None, "缺少有效的包装重量(g)"),
        ("depth", 0, "缺少有效的包装长度/深度(mm)"),
        ("width", -1, "缺少有效的包装宽度(mm)"),
        ("height", None, "缺少有效的包装高度(mm)"),
    ],
)
def test_missing_or_nonpositive_package_values_are_actionable(field, value, expected):
    draft = _ready_draft(**{field: value})

    with pytest.raises(OzonItemValidationError) as exc_info:
        _build_ozon_item(draft)

    assert expected in exc_info.value.errors


def test_legacy_default_scalars_are_rejected_without_source():
    draft = _ready_draft(
        weight=500,
        depth=100,
        width=100,
        height=100,
        package_facts=None,
    )

    errors = get_draft_readiness_errors(draft)

    assert len([error for error in errors if "缺少采集来源或人工修改审计" in error]) == 4


def test_matching_manual_package_audit_makes_explicit_overrides_ready():
    draft = _ready_draft(
        weight=901,
        depth=902,
        width=903,
        height=904,
        package_facts=None,
        package_override_audit={
            "weight": {"source": "manual_override", "reason": "measured", "value": 901},
            "depth": {"source": "manual_override", "reason": "measured", "value": 902},
            "width": {"source": "manual_override", "reason": "measured", "value": 903},
            "height": {"source": "manual_override", "reason": "measured", "value": 904},
        },
    )

    item = _build_ozon_item(draft)

    assert (item["weight"], item["depth"], item["width"], item["height"]) == (
        901,
        902,
        903,
        904,
    )