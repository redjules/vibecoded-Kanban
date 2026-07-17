import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

STATIC_DIR = Path(__file__).parent / "static"
SESSION_COOKIE = "pm_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
SESSION_SECRET = os.environ.get("SESSION_SECRET", "local-development-session-secret")


class LoginRequest(BaseModel):
    username: str
    password: str


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


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")