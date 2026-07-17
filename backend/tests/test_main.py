from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import app

@pytest.fixture
def client(tmp_path: Path):
    previous_database_path = app.state.database_path
    app.state.database_path = tmp_path / "project-management.db"
    database.initialize(app.state.database_path)
    with TestClient(app) as test_client:
        yield test_client
    app.state.database_path = previous_database_path


def sign_in(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_serves_static_page(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Project Management MVP" in response.text


def test_login_creates_session_and_restores_it(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )

    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "pm_session" in response.headers["set-cookie"]
    assert client.get("/api/auth/session").json() == {"username": "user"}


def test_login_rejects_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "incorrect"}
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


def test_unauthenticated_requests_cannot_access_board_or_messages(client: TestClient) -> None:
    assert client.get("/api/auth/session").status_code == 401
    assert client.get("/api/board").status_code == 401
    assert client.get("/api/messages").status_code == 401


def test_seeded_board_has_demo_columns_and_cards(client: TestClient) -> None:
    sign_in(client)

    board = client.get("/api/board").json()

    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert len(board["cards"]) == 8
    assert board["columns"][0]["cardIds"] == ["1", "2"]


def test_board_mutations_return_persisted_canonical_board(client: TestClient) -> None:
    sign_in(client)
    board = client.get("/api/board").json()
    backlog_id = board["columns"][0]["id"]
    discovery_id = board["columns"][1]["id"]
    card_id = board["columns"][0]["cardIds"][0]

    renamed_board = client.patch(
        f"/api/columns/{backlog_id}", json={"title": "Ideas"}
    ).json()
    created_board = client.post(
        f"/api/columns/{backlog_id}/cards",
        json={"title": "Persisted card", "details": "Stored in SQLite."},
    ).json()
    updated_board = client.patch(
        f"/api/cards/{card_id}", json={"title": "Updated card", "details": "Edited."}
    ).json()
    moved_board = client.post(
        f"/api/cards/{card_id}/move",
        json={"column_id": int(discovery_id), "position": 0},
    ).json()
    deleted_board = client.delete(f"/api/cards/{card_id}").json()

    assert renamed_board["columns"][0]["title"] == "Ideas"
    assert created_board["cards"][created_board["columns"][0]["cardIds"][-1]]["title"] == "Persisted card"
    assert updated_board["cards"][card_id] == {
        "id": card_id,
        "title": "Updated card",
        "details": "Edited.",
    }
    assert moved_board["columns"][1]["cardIds"][0] == card_id
    assert card_id not in deleted_board["cards"]
    assert client.get("/api/board").json() == deleted_board


def test_invalid_move_does_not_change_card_order(client: TestClient) -> None:
    sign_in(client)
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cardIds"][0]
    destination_column_id = board["columns"][1]["id"]

    response = client.post(
        f"/api/cards/{card_id}/move",
        json={"column_id": int(destination_column_id), "position": 99},
    )

    assert response.status_code == 422
    assert client.get("/api/board").json() == board


def test_conversation_messages_are_persisted_in_order(client: TestClient) -> None:
    sign_in(client)

    first_response = client.post(
        "/api/messages", json={"role": "user", "content": "Create a card."}
    )
    second_response = client.post(
        "/api/messages", json={"role": "assistant", "content": "Which column?"}
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert client.get("/api/messages").json() == [
        {"id": "1", "role": "user", "content": "Create a card."},
        {"id": "2", "role": "assistant", "content": "Which column?"},
    ]


def test_logout_clears_session(client: TestClient) -> None:
    sign_in(client)

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert "pm_session=\"\"" in response.headers["set-cookie"]
    assert client.get("/api/auth/session").status_code == 401