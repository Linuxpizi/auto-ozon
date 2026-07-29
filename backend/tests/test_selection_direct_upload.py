from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.scraped_product import ScrapedProductRecord
from app.models.store import Store


def _auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "selection-direct-upload@example.com",
            "password": "password123",
        },
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_store(db: Session) -> Store:
    store = Store(
        name="Selection direct upload store",
        client_id="selection-direct-client",
        api_key="selection-direct-key",
        status="active",
    )
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


def _strict_attribute_facts() -> list[dict]:
    return [
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
        {
            "attributeId": 40,
            "recognized": False,
            "publishable": True,
            "values": [{"value": "skip"}],
        },
        {
            "attributeId": 41,
            "recognized": True,
            "publishable": False,
            "values": [{"value": "skip"}],
        },
        {
            "attributeId": 0,
            "recognized": True,
            "publishable": True,
            "values": [{"value": "skip"}],
        },
        {
            "name": "Text-only",
            "recognized": True,
            "publishable": True,
            "values": [{"value": "skip"}],
        },
        {
            "attributeId": 42,
            "recognized": "true",
            "publishable": True,
            "values": [{"value": "skip"}],
        },
        {
            "attributeId": 43,
            "recognized": True,
            "publishable": True,
            "values": [{"value": {"nested": "skip"}}],
        },
    ]


def _ready_record(
    source_id: str = "PRODUCT-1",
    *,
    include_package: bool = True,
) -> ScrapedProductRecord:
    variant = {
        "sku": "SKU-SELECTED",
        "ozonAttributeFacts": _strict_attribute_facts(),
    }
    if include_package:
        variant.update(
            {
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
        )

    return ScrapedProductRecord(
        platform="ozon",
        source_id=source_id,
        title="Product fallback",
        price=10.0,
        old_price=20.0,
        description="Exact description",
        images=["https://product.example/fallback.jpg"],
        selected_sku="SKU-SELECTED",
        sku_list=[
            {
                "sku": "SKU-SELECTED",
                "name": "Selected title",
                "price": 123.45,
                "oldPrice": 150.01,
                "barcode": "4601234567890",
                "images": [
                    f"https://sku.example/{index}.jpg"
                    for index in range(1, 18)
                ],
            }
        ],
        variants=[variant],
        package_facts={
            "packageWeightG": 901,
            "packageDepthMm": 902,
            "packageWidthMm": 903,
            "packageHeightMm": 904,
            "packagePhysicalProvenance": {
                "packageWeightG": {"source": "product_fallback"},
                "packageDepthMm": {"source": "product_fallback"},
                "packageWidthMm": {"source": "product_fallback"},
                "packageHeightMm": {"source": "product_fallback"},
            },
        } if include_package else {},
        ozon_attribute_facts=[
            {
                "attributeId": 10,
                "scope": "product",
                "recognized": True,
                "publishable": True,
                "values": [{"value": "Product value must be replaced"}],
            }
        ],
        facts=[
            {
                "name": "Never infer this textual fact",
                "value": "Not an Ozon attribute",
                "attributeId": 9999,
            }
        ],
        ozon_metrics={"weightG": 999, "lengthMm": 888},
    )


def _simple_ready_record(source_id: str) -> ScrapedProductRecord:
    package_facts = {
        "packageWeightG": 321,
        "packageDepthMm": 410,
        "packageWidthMm": 220,
        "packageHeightMm": 130,
        "packagePhysicalProvenance": {
            "packageWeightG": {"source": "seller_product"},
            "packageDepthMm": {"source": "seller_product"},
            "packageWidthMm": {"source": "seller_product"},
            "packageHeightMm": {"source": "seller_product"},
        },
    }
    return ScrapedProductRecord(
        platform="ozon",
        source_id=source_id,
        title=f"Title {source_id}",
        price=99.99,
        old_price=120.0,
        description=f"Description {source_id}",
        images=[f"https://product.example/{source_id}.jpg"],
        package_facts=package_facts,
    )


def _save_records(db: Session, records: list[ScrapedProductRecord]) -> list[ScrapedProductRecord]:
    db.add_all(records)
    db.commit()
    for record in records:
        db.refresh(record)
    return records


def _expected_exact_item(offer_id: str = "DIRECT-1") -> dict:
    return {
        "offer_id": offer_id,
        "name": "Selected title",
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
        "primary_image": "https://sku.example/1.jpg",
        "images": [
            f"https://sku.example/{index}.jpg"
            for index in range(2, 18)
        ],
        "price": "123.45",
        "old_price": "150.01",
        "vat": "0",
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
                        "values": [
                            {"dictionary_value_id": 0, "value": "Part A"}
                        ],
                    },
                    {
                        "id": 21,
                        "complex_id": 300,
                        "values": [
                            {"dictionary_value_id": 8, "value": "Part B"}
                        ],
                    },
                ]
            },
            {
                "attributes": [
                    {
                        "id": 30,
                        "complex_id": 0,
                        "values": [
                            {"dictionary_value_id": 0, "value": "true"}
                        ],
                    }
                ]
            },
        ],
    }


def test_single_direct_upload_sends_exact_selected_sku_payload(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    record = _save_records(test_db, [_ready_record()])[0]

    with patch("app.services.ozon_client.OzonClient") as client_class:
        importer = client_class.return_value.import_products
        importer.return_value = {"result": {"task_id": 123}}

        response = test_app.post(
            f"/api/selection/products/{record.id}/upload",
            headers=headers,
            json={
                "store_id": store.id,
                "description_category_id": 100,
                "type_id": 200,
                "offer_id": "DIRECT-1",
            },
        )

    assert response.status_code == 200, response.text
    client_class.assert_called_once_with(
        client_id="selection-direct-client",
        api_key="selection-direct-key",
    )
    importer.assert_called_once_with(items=[_expected_exact_item()])
    sent_item = importer.call_args.kwargs["items"][0]
    assert "status" not in sent_item
    assert all(attribute["id"] != 9999 for attribute in sent_item["attributes"])

    assert response.json() == {
        "success": True,
        "result": {"result": {"task_id": 123}},
        "task_id": 123,
        "offer_id": "DIRECT-1",
        "dimensions": {
            "weight_g": 321,
            "height_mm": 130,
            "depth_mm": 410,
            "width_mm": 220,
            "sources": {
                "weight": "seller_exact_sku",
                "height": "seller_exact_sku",
                "depth": "seller_exact_sku",
                "width": "seller_exact_sku",
            },
            "missing": [],
        },
    }
    test_db.refresh(record)
    assert record.upload_status == "uploading"
    assert record.upload_task_id == "123"
    assert record.offer_id == "DIRECT-1"
    assert record.ozon_category_id == 100
    assert record.ozon_type_id == 200


def test_invalid_single_direct_upload_never_constructs_ozon_client(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    record = _save_records(test_db, [_ready_record(include_package=False)])[0]

    with patch("app.services.ozon_client.OzonClient") as client_class:
        response = test_app.post(
            f"/api/selection/products/{record.id}/upload",
            headers=headers,
            json={
                "store_id": store.id,
                "description_category_id": 100,
                "type_id": 200,
            },
        )

    assert response.status_code == 400, response.text
    assert "包装重量" in response.json()["detail"]
    client_class.assert_not_called()
    test_db.refresh(record)
    assert record.upload_status == "not_uploaded"
    assert record.upload_task_id == ""


@pytest.mark.parametrize("import_result", [{}, {"result": [123]}])
def test_invalid_single_import_response_does_not_persist_uploading_state(
    test_app: TestClient,
    test_db: Session,
    import_result: dict,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    record = _save_records(test_db, [_ready_record()])[0]

    with patch("app.services.ozon_client.OzonClient") as client_class:
        client_class.return_value.import_products.return_value = import_result
        response = test_app.post(
            f"/api/selection/products/{record.id}/upload",
            headers=headers,
            json={
                "store_id": store.id,
                "description_category_id": 100,
                "type_id": 200,
                "offer_id": "INVALID-RESPONSE",
            },
        )

    assert response.status_code == 500, response.text
    assert "result.task_id" in response.json()["detail"]
    test_db.refresh(record)
    assert record.upload_status == "not_uploaded"
    assert record.upload_task_id == ""
    assert record.offer_id == ""


def test_manual_package_overrides_require_reason_and_are_audited(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    record = _save_records(test_db, [_ready_record(include_package=False)])[0]
    request = {
        "store_id": store.id,
        "description_category_id": 100,
        "type_id": 200,
        "offer_id": "MANUAL-PACKAGE",
        "weight_g": 501,
        "height_mm": 102,
        "depth_mm": 303,
        "width_mm": 204,
    }

    with patch("app.services.ozon_client.OzonClient") as client_class:
        missing_reason_response = test_app.post(
            f"/api/selection/products/{record.id}/upload",
            headers=headers,
            json=request,
        )
        client_class.assert_not_called()

        importer = client_class.return_value.import_products
        importer.return_value = {"result": {"task_id": 456}}
        accepted_response = test_app.post(
            f"/api/selection/products/{record.id}/upload",
            headers=headers,
            json={**request, "package_override_reason": "Measured sealed parcel"},
        )

    assert missing_reason_response.status_code == 400, missing_reason_response.text
    assert "package_override_reason" in missing_reason_response.json()["detail"]
    assert accepted_response.status_code == 200, accepted_response.text
    expected = _expected_exact_item("MANUAL-PACKAGE")
    expected.update({"weight": 501, "height": 102, "depth": 303, "width": 204})
    importer.assert_called_once_with(items=[expected])
    assert accepted_response.json()["dimensions"] == {
        "weight_g": 501,
        "height_mm": 102,
        "depth_mm": 303,
        "width_mm": 204,
        "sources": {
            "weight": "manual_override",
            "height": "manual_override",
            "depth": "manual_override",
            "width": "manual_override",
        },
        "missing": [],
    }


def test_mixed_batch_sends_only_valid_exact_items(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    valid, invalid = _save_records(
        test_db,
        [_ready_record("VALID"), _ready_record("INVALID", include_package=False)],
    )

    with patch("app.services.ozon_client.OzonClient") as client_class:
        importer = client_class.return_value.import_products
        importer.return_value = {"result": {"task_id": 701}}
        response = test_app.post(
            "/api/selection/products/batch-upload",
            headers=headers,
            json={
                "product_ids": [invalid.id, valid.id],
                "store_id": store.id,
                "description_category_id": 100,
                "type_id": 200,
            },
        )

    assert response.status_code == 200, response.text
    importer.assert_called_once_with(items=[_expected_exact_item("AUTO-VALID")])
    result = response.json()["result"]
    assert result["success"] == 1
    assert result["failed"] == 1
    assert result["errors"][0]["product_id"] == invalid.id
    assert "包装重量" in result["errors"][0]["error"]

    test_db.refresh(valid)
    test_db.refresh(invalid)
    assert valid.upload_status == "uploading"
    assert valid.upload_task_id == "701"
    assert invalid.upload_status == "not_uploaded"
    assert invalid.upload_task_id == ""


def test_batch_chunks_101_valid_items_and_tracks_each_task(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    records = _save_records(
        test_db,
        [_simple_ready_record(f"CHUNK-{index:03d}") for index in range(101)],
    )

    with patch("app.services.ozon_client.OzonClient") as client_class:
        importer = client_class.return_value.import_products
        importer.side_effect = [
            {"result": {"task_id": 1000}},
            {"result": {"task_id": 2001}},
        ]
        response = test_app.post(
            "/api/selection/products/batch-upload",
            headers=headers,
            json={
                "product_ids": [record.id for record in records],
                "store_id": store.id,
                "description_category_id": 100,
                "type_id": 200,
            },
        )

    assert response.status_code == 200, response.text
    assert importer.call_count == 2
    assert [len(call.kwargs["items"]) for call in importer.call_args_list] == [100, 1]
    assert response.json() == {
        "success": True,
        "result": {"success": 101, "failed": 0, "errors": []},
        "task_id": 1000,
    }

    test_db.refresh(records[0])
    test_db.refresh(records[99])
    test_db.refresh(records[100])
    assert records[0].upload_task_id == "1000"
    assert records[99].upload_task_id == "1000"
    assert records[100].upload_task_id == "2001"
    assert all(record.upload_status == "uploading" for record in records)


def test_batch_chunk_failure_keeps_previous_and_later_successes(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    records = _save_records(
        test_db,
        [_simple_ready_record(f"ISOLATE-{index:03d}") for index in range(201)],
    )

    with patch("app.services.ozon_client.OzonClient") as client_class:
        importer = client_class.return_value.import_products
        importer.side_effect = [
            {"result": {"task_id": 3001}},
            RuntimeError("middle chunk rejected"),
            {"result": {"task_id": 3003}},
        ]
        response = test_app.post(
            "/api/selection/products/batch-upload",
            headers=headers,
            json={
                "product_ids": [record.id for record in records],
                "store_id": store.id,
                "description_category_id": 100,
                "type_id": 200,
            },
        )

    assert response.status_code == 200, response.text
    assert [len(call.kwargs["items"]) for call in importer.call_args_list] == [100, 100, 1]
    result = response.json()["result"]
    assert result["success"] == 101
    assert result["failed"] == 100
    assert len(result["errors"]) == 100
    assert {error["product_id"] for error in result["errors"]} == {
        record.id for record in records[100:200]
    }
    assert {error["error"] for error in result["errors"]} == {
        "middle chunk rejected"
    }

    for record in (records[0], records[99], records[100], records[199], records[200]):
        test_db.refresh(record)
    assert records[0].upload_status == "uploading"
    assert records[99].upload_status == "uploading"
    assert records[0].upload_task_id == "3001"
    assert records[99].upload_task_id == "3001"
    assert records[100].upload_status == "not_uploaded"
    assert records[199].upload_status == "not_uploaded"
    assert records[100].upload_task_id == ""
    assert records[199].upload_task_id == ""
    assert records[200].upload_status == "uploading"
    assert records[200].upload_task_id == "3003"


@pytest.mark.parametrize(
    ("ozon_status", "expected_status"),
    [
        ("pending", "pending"),
        ("imported", "success"),
        ("failed", "failed"),
        ("skipped", "success"),
    ],
)
def test_upload_status_maps_official_status_for_matching_offer_id(
    test_app: TestClient,
    test_db: Session,
    ozon_status: str,
    expected_status: str,
):
    headers = _auth_headers(test_app)
    _create_store(test_db)
    record = _ready_record()
    record.upload_status = "uploading"
    record.upload_task_id = "172549793"
    record.offer_id = "MATCH-ME"
    record = _save_records(test_db, [record])[0]

    with patch("app.services.ozon_client.OzonClient") as client_class:
        client = client_class.return_value
        client.get_import_task_status.return_value = {
            "items": [
                {"offer_id": "OTHER", "status": "failed"},
                {"offer_id": "MATCH-ME", "status": ozon_status},
            ],
            "total": 2,
        }
        client.get_product_list_by_task_id.return_value = []
        response = test_app.post(
            f"/api/selection/products/{record.id}/upload-status",
            headers=headers,
        )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "upload_status": expected_status,
        "ozon_status": ozon_status,
        "errors": "",
        "ozon_product_id": 0,
    }
    client.get_import_task_status.assert_called_once_with(172549793)
    if expected_status == "success":
        client.get_product_list_by_task_id.assert_called_once_with(172549793)
    else:
        client.get_product_list_by_task_id.assert_not_called()
    test_db.refresh(record)
    assert record.upload_status == expected_status


def test_imported_upload_status_persists_product_id_and_match(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    _create_store(test_db)
    record = _ready_record()
    record.upload_status = "uploading"
    record.upload_task_id = "321"
    record.offer_id = "ONLY-OFFER"
    record = _save_records(test_db, [record])[0]

    with patch("app.services.ozon_client.OzonClient") as client_class:
        client = client_class.return_value
        client.get_import_task_status.return_value = {
            "items": [{"offer_id": "ONLY-OFFER", "status": "imported"}],
            "total": 1,
        }
        client.get_product_list_by_task_id.return_value = [{"product_id": 987654}]
        response = test_app.post(
            f"/api/selection/products/{record.id}/upload-status",
            headers=headers,
        )

    assert response.status_code == 200, response.text
    assert response.json()["ozon_product_id"] == 987654
    test_db.refresh(record)
    assert record.upload_status == "success"
    assert record.ozon_product_id == 987654
    assert record.matched is True
