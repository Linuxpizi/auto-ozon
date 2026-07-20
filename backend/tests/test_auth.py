from fastapi.testclient import TestClient


def test_register_login_and_me(test_app: TestClient):
    registered = test_app.post(
        "/api/auth/register",
        json={"email": " User@Example.com ", "password": "password123", "name": "测试用户"},
    )

    assert registered.status_code == 201
    session = registered.json()
    assert session["token_type"] == "bearer"
    assert session["user"]["email"] == "user@example.com"
    assert session["user"]["name"] == "测试用户"

    me = test_app.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {session['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "user@example.com"

    logged_in = test_app.post(
        "/api/auth/login",
        json={"email": "USER@EXAMPLE.COM", "password": "password123"},
    )
    assert logged_in.status_code == 200
    assert logged_in.json()["user"]["id"] == session["user"]["id"]


def test_auth_validation_and_duplicate_email(test_app: TestClient):
    payload = {"email": "duplicate@example.com", "password": "password123"}
    assert test_app.post("/api/auth/register", json=payload).status_code == 201
    assert test_app.post("/api/auth/register", json=payload).status_code == 409
    assert test_app.post(
        "/api/auth/login",
        json={"email": payload["email"], "password": "wrong-password"},
    ).status_code == 401
    assert test_app.post(
        "/api/auth/register",
        json={"email": "short@example.com", "password": "short"},
    ).status_code == 422


def test_business_routes_require_auth(test_app: TestClient):
    response = test_app.get("/api/browser-sync/products")
    assert response.status_code == 401