from app.models.ozon_cookie_snapshot import OzonCookieSnapshot


def test_upload_and_inspect_cookie_without_leaking_secrets(test_app, test_db):
    payload = {
        "client_id": "client-1",
        "ozon_cookie": "seller-secret=one",
        "sso_cookie": "sso-secret=one",
        "source": "browser-extension",
    }

    uploaded = test_app.put("/api/browser-sync/ozon-cookies", json=payload)
    assert uploaded.status_code == 200
    assert uploaded.json()["has_ozon_cookie"] is True
    assert uploaded.json()["has_sso_cookie"] is True
    assert "ozon_cookie" not in uploaded.json()
    assert "sso_cookie" not in uploaded.json()
    assert "seller-secret" not in uploaded.text
    assert "sso-secret" not in uploaded.text

    inspected = test_app.get(
        "/api/browser-sync/ozon-cookies/client-1/inspect"
    )
    assert inspected.status_code == 200
    assert inspected.json()["available"] is True
    assert inspected.json()["status"] == "available"
    assert "ozon_cookie" not in inspected.json()
    assert "sso_cookie" not in inspected.json()
    assert "seller-secret" not in inspected.text
    assert "sso-secret" not in inspected.text

    stored = test_db.query(OzonCookieSnapshot).one()
    assert stored.ozon_cookie == payload["ozon_cookie"]
    assert stored.sso_cookie == payload["sso_cookie"]


def test_missing_cookie_inspection(test_app):
    response = test_app.get(
        "/api/browser-sync/ozon-cookies/not-configured/inspect"
    )
    assert response.status_code == 200
    assert response.json() == {
        "client_id": "not-configured",
        "available": False,
        "status": "missing",
        "has_ozon_cookie": False,
        "has_sso_cookie": False,
        "updated_at": None,
    }


def test_cookie_upload_replaces_existing_snapshot(test_app, test_db):
    first = {
        "client_id": "client-2",
        "ozon_cookie": "seller-secret=old",
        "sso_cookie": "sso-secret=old",
    }
    second = {
        "client_id": "client-2",
        "ozon_cookie": "seller-secret=new",
        "sso_cookie": "",
    }

    assert test_app.put(
        "/api/browser-sync/ozon-cookies", json=first
    ).status_code == 200
    updated = test_app.put(
        "/api/browser-sync/ozon-cookies", json=second
    )
    assert updated.status_code == 200
    assert updated.json()["has_sso_cookie"] is False

    snapshots = test_db.query(OzonCookieSnapshot).all()
    assert len(snapshots) == 1
    assert snapshots[0].ozon_cookie == second["ozon_cookie"]
    assert snapshots[0].sso_cookie == ""


def test_aggregate_cookie_inspection_counts_only_available_snapshots(
    test_app,
    test_db,
):
    test_db.add_all([
        OzonCookieSnapshot(
            client_id="available-client",
            ozon_cookie="seller-secret=available",
            status="available",
        ),
        OzonCookieSnapshot(
            client_id="empty-client",
            ozon_cookie="",
            status="available",
        ),
        OzonCookieSnapshot(
            client_id="disabled-client",
            ozon_cookie="seller-secret=disabled",
            status="error",
        ),
    ])
    test_db.commit()

    response = test_app.get("/api/browser-sync/ozon-cookies/inspect")

    assert response.status_code == 200
    assert response.json() == {
        "available_count": 1,
        "total_count": 3,
    }
    assert "seller-secret" not in response.text
