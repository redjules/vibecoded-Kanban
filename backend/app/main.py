import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import database

STATIC_DIR = Path(__file__).parent / "static"
SESSION_COOKIE = "pm_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
SESSION_SECRET = os.environ.get("SESSION_SECRET", "local-development-session-secret")


class LoginRequest(BaseModel):
    username: str
    password: str


class ColumnRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class CardCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=10_000)


class CardUpdateRequest(CardCreateRequest):
    pass


class CardMoveRequest(BaseModel):
    column_id: int
    position: int = Field(ge=0)


class MessageCreateRequest(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=10_000)


def _encode_session(username: str) -> str:
    payload = json.dumps(
        {"username": username, "expires_at": int(time.time()) + SESSION_MAX_AGE_SECONDS},
        separators=(",", ":"),
    ).encode()
    encoded_payload = base64.urlsafe_b64encode(payload).rstrip(b"=").decode()
    signature = hmac.new(
        SESSION_SECRET.encode(), encoded_payload.encode(), hashlib.sha256
    ).hexdigest()
    return f"{encoded_payload}.{signature}"


def _session_username(request: Request) -> str | None:
    session = request.cookies.get(SESSION_COOKIE)
    if not session or "." not in session:
        return None

    encoded_payload, signature = session.rsplit(".", 1)
    expected_signature = hmac.new(
        SESSION_SECRET.encode(), encoded_payload.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        padded_payload = encoded_payload + "=" * (-len(encoded_payload) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded_payload))
    except (ValueError, json.JSONDecodeError):
        return None

    if payload.get("username") != "user" or payload.get("expires_at", 0) < time.time():
        return None
    return "user"

app = FastAPI(title="Project Management MVP API")
app.state.database_path = Path(os.environ.get("DATABASE_PATH", database.DEFAULT_DATABASE_PATH))


@app.on_event("startup")
def initialize_database() -> None:
    database.initialize(app.state.database_path)


@app.middleware("http")
async def require_authenticated_api(request: Request, call_next):
    public_paths = {"/api/health", "/api/auth/login", "/api/auth/session", "/api/auth/logout"}
    if request.url.path.startswith("/api/") and request.url.path not in public_paths:
        if _session_username(request) is None:
            return Response(status_code=401, content='{"detail":"Not authenticated"}', media_type="application/json")
    return await call_next(request)


@app.get("/api/health")
def read_health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(credentials: LoginRequest, response: Response) -> dict[str, str]:
    if credentials.username != "user" or credentials.password != "password":
        raise HTTPException(status_code=401, detail="Invalid username or password")

    response.set_cookie(
        key=SESSION_COOKIE,
        value=_encode_session("user"),
        httponly=True,
        max_age=SESSION_MAX_AGE_SECONDS,
        samesite="lax",
        secure=False,
        path="/",
    )
    return {"username": "user"}


@app.post("/api/auth/logout", status_code=204)
def logout() -> Response:
    response = Response(status_code=204)
    response.delete_cookie(key=SESSION_COOKIE, path="/")
    return response


@app.get("/api/auth/session")
def read_session(request: Request) -> dict[str, str]:
    username = _session_username(request)
    if username is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"username": username}


def authenticated_username(request: Request) -> str:
    username = _session_username(request)
    if username is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username


def translate_database_error(operation) -> dict:
    try:
        return operation()
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/board")
def read_board(request: Request) -> dict:
    username = authenticated_username(request)
    return translate_database_error(
        lambda: database.board_for_user(app.state.database_path, username)
    )


@app.patch("/api/columns/{column_id}")
def rename_board_column(column_id: int, payload: ColumnRenameRequest, request: Request) -> dict:
    username = authenticated_username(request)
    return translate_database_error(
        lambda: database.rename_column(
            app.state.database_path, username, column_id, payload.title
        )
    )


@app.post("/api/columns/{column_id}/cards", status_code=201)
def create_board_card(column_id: int, payload: CardCreateRequest, request: Request) -> dict:
    username = authenticated_username(request)
    return translate_database_error(
        lambda: database.create_card(
            app.state.database_path, username, column_id, payload.title, payload.details
        )
    )


@app.patch("/api/cards/{card_id}")
def update_board_card(card_id: int, payload: CardUpdateRequest, request: Request) -> dict:
    username = authenticated_username(request)
    return translate_database_error(
        lambda: database.update_card(
            app.state.database_path, username, card_id, payload.title, payload.details
        )
    )


@app.delete("/api/cards/{card_id}")
def delete_board_card(card_id: int, request: Request) -> dict:
    username = authenticated_username(request)
    return translate_database_error(
        lambda: database.delete_card(app.state.database_path, username, card_id)
    )


@app.post("/api/cards/{card_id}/move")
def move_board_card(card_id: int, payload: CardMoveRequest, request: Request) -> dict:
    username = authenticated_username(request)
    return translate_database_error(
        lambda: database.move_card(
            app.state.database_path,
            username,
            card_id,
            payload.column_id,
            payload.position,
        )
    )


@app.get("/api/messages")
def read_messages(request: Request) -> list[dict]:
    username = authenticated_username(request)
    return database.messages_for_user(app.state.database_path, username)


@app.post("/api/messages", status_code=201)
def create_conversation_message(payload: MessageCreateRequest, request: Request) -> list[dict]:
    username = authenticated_username(request)
    return database.create_message(
        app.state.database_path, username, payload.role, payload.content
    )


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")