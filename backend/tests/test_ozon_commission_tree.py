import json

import pytest

from app.api.routers import selection


def test_commission_tree_returns_empty_when_not_configured(
    test_app, monkeypatch, tmp_path
):
    monkeypatch.setattr(
        selection, "OZON_COMMISSION_TREE_PATH", tmp_path / "missing.json"
    )

    response = test_app.get("/api/selection/ozon-commission-tree")
    assert response.status_code == 200
    assert response.json() == {
        "result": [],
        "configured": False,
        "source": "local",
    }


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ([{"id": 1, "label": "A"}], [{"id": 1, "label": "A"}]),
        ({"result": [{"id": 2}]}, [{"id": 2}]),
    ],
)
def test_commission_tree_accepts_supported_local_formats(
    test_app, monkeypatch, tmp_path, payload, expected
):
    path = tmp_path / "commission-tree.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setattr(selection, "OZON_COMMISSION_TREE_PATH", path)

    response = test_app.get("/api/selection/ozon-commission-tree")
    assert response.status_code == 200
    assert response.json() == {
        "result": expected,
        "configured": True,
        "source": "local",
    }


def test_commission_tree_rejects_invalid_json(test_app, monkeypatch, tmp_path):
    path = tmp_path / "commission-tree.json"
    path.write_text("{not-json", encoding="utf-8")
    monkeypatch.setattr(selection, "OZON_COMMISSION_TREE_PATH", path)

    response = test_app.get("/api/selection/ozon-commission-tree")
    assert response.status_code == 500
    assert "JSON" in response.json()["detail"]
