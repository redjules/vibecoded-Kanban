from pathlib import Path
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import app
from app.openrouter import OPENROUTER_MODEL, OpenRouterClient, OpenRouterError


def test_client_sends_openrouter_compatible_request() -> None:
    captured_request: httpx.Request | None = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "4"}}]},
        )

    client = httpx.Client(
        transport=httpx.MockTransport(handler), base_url="https://example.test"
    )

    result = OpenRouterClient(api_key="test-key", client=client).complete("What is 2 + 2?")

    assert result == "4"
    assert captured_request is not None
    assert captured_request.headers["Authorization"] == "Bearer test-key"
    assert captured_request.url.path == "/chat/completions"
    assert json_body(captured_request) == {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": "What is 2 + 2?"}],
    }


def json_body(request: httpx.Request) -> dict:
    import json

    return json.loads(request.content)


def test_client_rejects_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(OpenRouterError, match="not configured"):
        OpenRouterClient().complete("What is 2 + 2?")


def test_client_sanitizes_provider_failures() -> None:
    client = httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(401)),
        base_url="https://example.test",
    )

    with pytest.raises(OpenRouterError, match="rejected"):
        OpenRouterClient(api_key="test-key", client=client).complete("Hello")


def test_client_sanitizes_timeouts() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    client = httpx.Client(
        transport=httpx.MockTransport(handler), base_url="https://example.test"
    )

    with pytest.raises(OpenRouterError, match="timed out"):
        OpenRouterClient(api_key="test-key", client=client).complete("Hello")


@pytest.fixture
def authenticated_client(tmp_path: Path):
    previous_database_path = app.state.database_path
    app.state.database_path = tmp_path / "project-management.db"
    database.initialize(app.state.database_path)
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/login", json={"username": "user", "password": "password"}
        )
        assert response.status_code == 200
        yield client
    app.state.database_path = previous_database_path


def test_connectivity_check_is_authenticated_and_uses_provider(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.main.OpenRouterClient.complete", lambda self, prompt: "4")

    response = authenticated_client.post("/api/ai/connectivity-check")

    assert response.status_code == 200
    assert response.json() == {"response": "4"}
    assert TestClient(app).post("/api/ai/connectivity-check").status_code == 401


def test_connectivity_check_sanitizes_provider_error(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(self: OpenRouterClient, prompt: str) -> str:
        raise OpenRouterError("The AI provider timed out. Try again.")

    monkeypatch.setattr("app.main.OpenRouterClient.complete", fail)

    response = authenticated_client.post("/api/ai/connectivity-check")

    assert response.status_code == 503
    assert response.json() == {"detail": "The AI provider timed out. Try again."}


def test_ai_message_applies_multiple_operations_and_persists_history(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    board = authenticated_client.get("/api/board").json()
    backlog_id = int(board["columns"][0]["id"])
    discovery_id = int(board["columns"][1]["id"])
    first_card_id = int(board["columns"][0]["cardIds"][0])
    second_card_id = int(board["columns"][0]["cardIds"][1])
    model_result = {
        "reply": "I updated the board.",
        "operations": [
            {"type": "rename_column", "column_id": backlog_id, "title": "Ideas"},
            {
                "type": "edit_card",
                "card_id": first_card_id,
                "title": "Updated roadmap",
                "details": "Revised by AI.",
            },
            {"type": "move_card", "card_id": second_card_id, "column_id": discovery_id, "position": 0},
            {
                "type": "create_card",
                "column_id": backlog_id,
                "title": "New research task",
                "details": "Validate the next opportunity.",
            },
        ],
    }
    captured_prompt: str | None = None

    def complete(self: OpenRouterClient, prompt: str) -> str:
        nonlocal captured_prompt
        captured_prompt = prompt
        return json.dumps(model_result)

    authenticated_client.post(
        "/api/messages", json={"role": "user", "content": "Earlier context."}
    )
    monkeypatch.setattr("app.main.OpenRouterClient.complete", complete)

    response = authenticated_client.post("/api/ai/messages", json={"content": "Update the plan."})

    assert response.status_code == 200
    result = response.json()
    assert result["operationsApplied"] == 4
    assert result["board"]["columns"][0]["title"] == "Ideas"
    assert result["board"]["cards"][str(first_card_id)] == {
        "id": str(first_card_id),
        "title": "Updated roadmap",
        "details": "Revised by AI.",
    }
    assert result["board"]["columns"][1]["cardIds"][0] == str(second_card_id)
    created_card_id = result["board"]["columns"][0]["cardIds"][-1]
    assert result["board"]["cards"][created_card_id]["title"] == "New research task"
    assert result["messages"] == [
        {"id": "1", "role": "user", "content": "Earlier context."},
        {"id": "2", "role": "user", "content": "Update the plan."},
        {"id": "3", "role": "assistant", "content": "I updated the board."},
    ]
    assert captured_prompt is not None
    assert '"title":"Backlog"' in captured_prompt
    assert '"content":"Earlier context."' in captured_prompt


def test_ai_message_deletes_a_card(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    board = authenticated_client.get("/api/board").json()
    card_id = board["columns"][0]["cardIds"][0]
    monkeypatch.setattr(
        "app.main.OpenRouterClient.complete",
        lambda self, prompt: json.dumps(
            {
                "reply": "The card was removed.",
                "operations": [{"type": "delete_card", "card_id": int(card_id)}],
            }
        ),
    )

    response = authenticated_client.post("/api/ai/messages", json={"content": "Delete it."})

    assert response.status_code == 200
    assert card_id not in response.json()["board"]["cards"]


@pytest.mark.parametrize(
    ("model_content", "expected_detail"),
    [
        ("not JSON", "invalid structured response"),
        ('{"reply":"Missing operations type","operations":[{"type":"unknown"}]}', "invalid structured response"),
    ],
)
def test_ai_message_rejects_invalid_structured_output(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    model_content: str,
    expected_detail: str,
) -> None:
    board = authenticated_client.get("/api/board").json()
    monkeypatch.setattr("app.main.OpenRouterClient.complete", lambda self, prompt: model_content)

    response = authenticated_client.post("/api/ai/messages", json={"content": "Make a change."})

    assert response.status_code == 422
    assert expected_detail in response.json()["detail"]
    assert authenticated_client.get("/api/board").json() == board
    assert authenticated_client.get("/api/messages").json() == []


def test_ai_message_rolls_back_all_operations_when_one_is_invalid(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    board = authenticated_client.get("/api/board").json()
    column_id = int(board["columns"][0]["id"])
    card_id = int(board["columns"][0]["cardIds"][0])
    monkeypatch.setattr(
        "app.main.OpenRouterClient.complete",
        lambda self, prompt: json.dumps(
            {
                "reply": "This should not be saved.",
                "operations": [
                    {"type": "rename_column", "column_id": column_id, "title": "Renamed"},
                    {"type": "move_card", "card_id": card_id, "column_id": column_id, "position": 99},
                ],
            }
        ),
    )

    response = authenticated_client.post("/api/ai/messages", json={"content": "Try an invalid move."})

    assert response.status_code == 422
    assert authenticated_client.get("/api/board").json() == board
    assert authenticated_client.get("/api/messages").json() == []


def test_ai_message_sanitizes_provider_error(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(self: OpenRouterClient, prompt: str) -> str:
        raise OpenRouterError("The AI provider timed out. Try again.")

    monkeypatch.setattr("app.main.OpenRouterClient.complete", fail)

    response = authenticated_client.post("/api/ai/messages", json={"content": "Create a card."})

    assert response.status_code == 503
    assert response.json() == {"detail": "The AI provider timed out. Try again."}


def test_ai_message_requires_an_authenticated_session(authenticated_client: TestClient) -> None:
    authenticated_client.cookies.clear()

    response = authenticated_client.post("/api/ai/messages", json={"content": "Hello."})

    assert response.status_code == 401