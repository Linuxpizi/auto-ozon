from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.store import Store
from app.models.upload_draft import UploadDraft


def _auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"email": "upload-draft-update@example.com", "password": "password123"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_store(db: Session) -> Store:
    store = Store(
        name="Upload draft route store",
        client_id="upload-draft-route-client",
        api_key="upload-draft-route-key",
        status="active",
    )
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


def _ready_draft(db: Session, store_id: int, **overrides) -> UploadDraft:
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
        "store_id": store_id,
        "offer_id": "ROUTE-OFFER-1",
        "name": "Route-ready draft",
        "description_category_id": 100,
        "type_id": 200,
        "price_rub": 123.45,
        "primary_image": "https://cdn.example.com/primary.jpg",
        "images": ["https://cdn.example.com/primary.jpg"],
        "weight": 321,
        "depth": 410,
        "width": 220,
        "height": 130,
        "package_facts": package_facts,
        "package_override_audit": {
            "depth": {
                "source": "manual_override",
                "reason": "existing depth review",
                "capturedAt": "2026-01-01T00:00:00+00:00",
                "value": 410,
            }
        },
        "status": "ready",
        "readiness_errors": [],
        "error_message": "",
    }
    data.update(overrides)
    draft = UploadDraft(**data)
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft


def test_positive_package_override_creates_field_audit_and_keeps_ready(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    draft = _ready_draft(test_db, store.id)

    response = test_app.put(
        f"/api/upload/drafts/{draft.id}",
        headers=headers,
        json={"weight": 654, "package_override_reason": "supplier carton reweighed"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["weight"] == 654
    assert payload["status"] == "ready"
    assert payload["readiness_errors"] == []
    assert payload["error_message"] == ""
    assert payload["package_override_audit"]["weight"] == {
        "source": "manual_override",
        "reason": "supplier carton reweighed",
        "capturedAt": payload["package_override_audit"]["weight"]["capturedAt"],
        "value": 654,
    }
    assert payload["package_override_audit"]["weight"]["capturedAt"]
    assert payload["package_override_audit"]["depth"]["reason"] == "existing depth review"

    test_db.refresh(draft)
    assert not hasattr(draft, "package_override_reason")


def test_explicit_null_package_field_clears_scalar_and_only_its_audit(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    draft = _ready_draft(
        test_db,
        store.id,
        weight=654,
        package_override_audit={
            "weight": {
                "source": "manual_override",
                "reason": "previous weight edit",
                "capturedAt": "2026-01-01T00:00:00+00:00",
                "value": 654,
            },
            "depth": {
                "source": "manual_override",
                "reason": "existing depth review",
                "capturedAt": "2026-01-01T00:00:00+00:00",
                "value": 410,
            },
        },
    )

    response = test_app.put(
        f"/api/upload/drafts/{draft.id}",
        headers=headers,
        json={"weight": None},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["weight"] is None
    assert "weight" not in payload["package_override_audit"]
    assert payload["package_override_audit"]["depth"]["reason"] == "existing depth review"
    assert payload["status"] == "draft"
    assert "缺少有效的包装重量(g)" in payload["readiness_errors"]
    assert "缺少有效的包装重量(g)" in payload["error_message"]

    test_db.refresh(draft)
    assert draft.weight is None
    assert draft.package_facts["packageWeightG"] == 321


def test_clearing_required_fields_recomputes_readiness_and_preserves_nulls(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    draft = _ready_draft(test_db, store.id)

    response = test_app.put(
        f"/api/upload/drafts/{draft.id}",
        headers=headers,
        json={"description_category_id": None, "name": None, "images": None},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["description_category_id"] is None
    assert payload["name"] is None
    assert payload["images"] is None
    assert payload["status"] == "draft"
    assert "缺少有效的 Ozon 描述分类 ID" in payload["readiness_errors"]
    assert "缺少商品标题" in payload["readiness_errors"]
    # primary_image is still valid, so clearing only the gallery does not invent
    # an image error or erase the factual primary image.
    assert "至少需要一张有效的 HTTP(S) 商品图片" not in payload["readiness_errors"]


def test_positive_package_override_requires_nonblank_reason(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    draft = _ready_draft(test_db, store.id)

    response = test_app.put(
        f"/api/upload/drafts/{draft.id}",
        headers=headers,
        json={"width": 999, "package_override_reason": "   "},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "人工修改包装信息必须提供修改原因"
    test_db.refresh(draft)
    assert draft.width == 220
    assert "width" not in (draft.package_override_audit or {})


def test_empty_update_is_400_and_missing_draft_is_404(
    test_app: TestClient,
    test_db: Session,
):
    headers = _auth_headers(test_app)
    store = _create_store(test_db)
    draft = _ready_draft(test_db, store.id)

    empty_response = test_app.put(
        f"/api/upload/drafts/{draft.id}",
        headers=headers,
        json={},
    )
    missing_response = test_app.put(
        "/api/upload/drafts/999999",
        headers=headers,
        json={},
    )

    assert empty_response.status_code == 400
    assert empty_response.json()["detail"] == "未提供更新字段"
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "草稿不存在"