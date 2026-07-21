from app.models.scraped_product import ScrapedProductRecord
from app.models.upload_draft import UploadDraft
from app.schemas.upload_draft import CreateDraftRequest, UploadDraftRead
from app.services.upload_service import _build_ozon_item, create_draft_from_scraped


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


def test_selected_sku_fields_are_used_for_draft(test_db):
    record = _save_record(
        test_db,
        _record(
            sku_list=[
                {
                    "sku": " SKU-2 ",
                    "name": " Selected title ",
                    "price": "22,5",
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


def test_create_request_and_read_schema_include_source_sku_and_barcode():
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
        }
    )
    assert read.source_sku == "SKU-API"
    assert read.barcode == "BARCODE-API"


def test_ozon_item_uses_draft_barcode():
    draft = UploadDraft(
        store_id=1,
        offer_id="OFFER-1",
        barcode="4601234567890",
        name="Draft title",
        images=["https://sku.example/1.jpg"],
        description_category_id=100,
        type_id=200,
        price_rub=0,
        old_price_rub=0,
    )

    item = _build_ozon_item(draft)

    assert item["barcode"] == "4601234567890"