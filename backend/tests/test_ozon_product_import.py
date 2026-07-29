from unittest.mock import MagicMock, patch

import pytest

from app.models.store import Store
from app.models.upload_draft import UploadDraft
from app.services.ozon_client import OzonClient
from app.services.upload_service import (
    _extract_import_task_id,
    check_draft_status,
    submit_batch_to_ozon,
    submit_draft_to_ozon,
)


def _store(test_db) -> Store:
    store = Store(
        name="Test store",
        client_id="test-client",
        api_key="test-key",
    )
    test_db.add(store)
    test_db.commit()
    test_db.refresh(store)
    return store


def _draft(store_id: int, offer_id: str, **overrides) -> UploadDraft:
    package_facts = {
        "packageWeightG": 321,
        "packageDepthMm": 410,
        "packageWidthMm": 220,
        "packageHeightMm": 130,
        "packagePhysicalProvenance": {
            "packageWeightG": {"source": "test_fact"},
            "packageDepthMm": {"source": "test_fact"},
            "packageWidthMm": {"source": "test_fact"},
            "packageHeightMm": {"source": "test_fact"},
        },
    }
    data = {
        "store_id": store_id,
        "description_category_id": 100,
        "type_id": 200,
        "offer_id": offer_id,
        "name": f"Product {offer_id}",
        "description": "Product description",
        "price_rub": 123.45,
        "old_price_rub": 150.01,
        "vat": "0.2",
        "weight": 321,
        "depth": 410,
        "width": 220,
        "height": 130,
        "primary_image": "https://images.example/primary.jpg",
        "images": ["https://images.example/primary.jpg"],
        "package_facts": package_facts,
        "status": "ready",
    }
    data.update(overrides)
    return UploadDraft(**data)


def _save_draft(test_db, draft: UploadDraft) -> UploadDraft:
    test_db.add(draft)
    test_db.commit()
    test_db.refresh(draft)
    return draft


def test_import_products_uses_official_v3_request_shape():
    client = OzonClient("test-client", "test-key")
    item = {"offer_id": "OFFER-1", "price": "123.45"}
    response = {"result": {"task_id": 172549793}}
    client._request = MagicMock(return_value=response)

    result = client.import_products([item])

    assert result is response
    client._request.assert_called_once_with(
        "POST",
        "/v3/product/import",
        json_body={"items": [item]},
    )


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (
            {"result": {"items": [{"offer_id": "OFFER-1", "status": "pending"}], "total": 1}},
            {"items": [{"offer_id": "OFFER-1", "status": "pending"}], "total": 1},
        ),
        ({"result": []}, {}),
    ],
)
def test_get_import_task_status_uses_official_request_shape(response, expected):
    client = OzonClient("test-client", "test-key")
    client._request = MagicMock(return_value=response)

    result = client.get_import_task_status(172549793)

    assert result == expected
    client._request.assert_called_once_with(
        "POST",
        "/v1/product/import/info",
        json_body={"task_id": "172549793"},
    )


def test_extract_import_task_id_accepts_official_response():
    assert _extract_import_task_id({"result": {"task_id": 172549793}}) == 172549793


@pytest.mark.parametrize(
    "response",
    [
        None,
        {},
        {"result": []},
        {"result": {"task_id": 0}},
        {"result": {"task_id": -1}},
        {"result": {"task_id": []}},
    ],
)
def test_extract_import_task_id_rejects_invalid_response(response):
    with pytest.raises(ValueError, match=r"result\.task_id"):
        _extract_import_task_id(response)


def test_submit_draft_invalid_response_persists_error(test_db):
    store = _store(test_db)
    draft = _save_draft(test_db, _draft(store.id, "OFFER-INVALID"))
    client = MagicMock()
    client.import_products.return_value = {}

    with patch("app.services.upload_service.OzonClient", return_value=client) as client_class:
        result = submit_draft_to_ozon(test_db, draft.id)

    test_db.refresh(draft)
    assert result["success"] is False
    assert result["task_id"] == 0
    assert "result.task_id" in result["error"]
    assert draft.status == "error"
    assert draft.ozon_task_id == 0
    assert "result.task_id" in draft.error_message
    client_class.assert_called_once_with(client_id="test-client", api_key="test-key")
    client.import_products.assert_called_once()


def test_batch_submission_shares_task_id_and_isolates_invalid_chunk(test_db):
    store = _store(test_db)
    drafts = [_draft(store.id, f"OFFER-{index:03d}") for index in range(101)]
    test_db.add_all(drafts)
    test_db.commit()
    draft_ids = [draft.id for draft in drafts]

    client = MagicMock()
    client.import_products.side_effect = [
        {"result": {"task_id": 8001}},
        {},
    ]

    with patch("app.services.upload_service.OzonClient", return_value=client):
        result = submit_batch_to_ozon(test_db, draft_ids)

    for draft in drafts:
        test_db.refresh(draft)

    assert result["total"] == 101
    assert result["submitted"] == 100
    assert result["failed"] == 1
    assert len(client.import_products.call_args_list[0].kwargs["items"]) == 100
    assert len(client.import_products.call_args_list[1].kwargs["items"]) == 1
    assert {draft.ozon_task_id for draft in drafts[:100]} == {8001}
    assert {draft.status for draft in drafts[:100]} == {"submitted"}
    assert drafts[100].status == "error"
    assert drafts[100].ozon_task_id == 0
    failed_result = next(item for item in result["results"] if item["draft_id"] == drafts[100].id)
    assert failed_result["success"] is False
    assert "result.task_id" in failed_result["error"]


@pytest.mark.parametrize(
    ("ozon_status", "expected_status"),
    [
        ("pending", "processing"),
        ("imported", "active"),
        ("failed", "error"),
        ("skipped", "active"),
    ],
)
def test_check_draft_status_matches_offer_and_maps_official_status(
    test_db,
    ozon_status,
    expected_status,
):
    store = _store(test_db)
    draft = _save_draft(
        test_db,
        _draft(
            store.id,
            "MATCH-ME",
            status="submitted",
            ozon_task_id=172549793,
            error_message="old error",
        ),
    )
    matching_item = {
        "offer_id": "MATCH-ME",
        "status": ozon_status,
        "product_id": 987654 if ozon_status == "imported" else 0,
        "errors": [{"message": "official failure"}] if ozon_status == "failed" else [],
    }
    client = MagicMock()
    client.get_import_task_status.return_value = {
        "items": [
            {"offer_id": "OTHER", "status": "failed"},
            matching_item,
        ],
        "total": 2,
    }

    with patch("app.services.upload_service.OzonClient", return_value=client):
        result = check_draft_status(test_db, draft.id)

    test_db.refresh(draft)
    assert result["status"] == expected_status
    assert draft.status == expected_status
    assert draft.error_message == ("official failure" if ozon_status == "failed" else "")
    assert draft.ozon_product_id == (987654 if ozon_status == "imported" else 0)
    client.get_import_task_status.assert_called_once_with(task_id=172549793)
