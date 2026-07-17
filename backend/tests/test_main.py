from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_serves_static_page() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Project Management MVP" in response.text


def test_login_creates_session_and_restores_it() -> None:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )

    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "pm_session" in response.headers["set-cookie"]

    session_response = client.get("/api/auth/session")

    assert session_response.status_code == 200
    assert session_response.json() == {"username": "user"}


def test_login_rejects_invalid_credentials() -> None:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "incorrect"}
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


def test_session_and_protected_api_reject_unauthenticated_requests() -> None:
    unauthenticated_client = TestClient(app)

    session_response = unauthenticated_client.get("/api/auth/session")
    protected_response = unauthenticated_client.get("/api/board")

    assert session_response.status_code == 401
    assert protected_response.status_code == 401


def test_logout_clears_session() -> None:
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert "pm_session=\"\"" in response.headers["set-cookie"]
    assert client.get("/api/auth/session").status_code == 401