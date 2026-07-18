# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A local, Docker-packaged Kanban project-management MVP. A FastAPI backend serves a statically exported Next.js frontend at `/` and JSON APIs under `/api/`. Board data and AI conversation history persist in SQLite. An AI sidebar (OpenRouter, `openai/gpt-oss-120b`) can read and mutate the board via validated structured operations.

This is an **approval-gated build**. `AGENTS.md` (root) holds the scope/constraints and `docs/PLAN.md` is the phase-by-phase execution checklist — do not begin an unapproved phase, and complete one phase at a time. There are also per-directory `AGENTS.md` files in `backend/`, `frontend/`, and `scripts/`.

## Commands

There are **two separate Python environments**, each with its own `pyproject.toml` / `uv.lock`:

- Repository-level tests (run from repo root; `pyproject.toml` sets `pythonpath=["backend"]`, `testpaths=["backend/tests"]`):
  ```
  uv run pytest
  ```
- Backend package (run from `backend/`):
  ```
  cd backend && uv run pytest
  ```
- A single test: `uv run pytest backend/tests/test_main.py::test_name`

Frontend (from `frontend/`):
- `npm run lint` — ESLint
- `npm run test:unit` — Vitest once (`test:unit:watch` to watch)
- `npm run test:e2e` — Playwright; runs `next dev` on `127.0.0.1:3100` unless `PLAYWRIGHT_BASE_URL` is set (point it at a running container to test the delivered build)
- `npm run build` — production build; `next.config.ts` sets `output: "export"`, emitting static assets to `frontend/out/`

Container (from repo root, via `docker compose`):
- `scripts/start.sh` / `scripts/start.ps1` — `docker compose up --build --detach`
- `scripts/stop.sh` / `scripts/stop.ps1`
- App listens on `:8000`; a named volume `project-management-data` holds the SQLite file at `/data`.

## Architecture

**Single-container delivery.** The multi-stage `Dockerfile` builds the Next.js site (`npm run build` → `frontend/out/`), installs backend deps with `uv sync --frozen`, then copies the static export into `backend/app/static/`. FastAPI mounts that directory at `/` with `html=True` (`app/main.py`), so the same server serves the SPA and the API. `docs/PLAN.md` phases 2–3 established this pipeline.

**Backend is three focused modules under `backend/app/`:**
- `main.py` — all HTTP routes, auth, and request/response Pydantic models. An `@app.middleware("http")` guards every `/api/*` path except a fixed public set (`/api/health`, `/api/auth/*`). Board/card/message handlers delegate to `database`; `translate_database_error` maps `LookupError→404` and `ValueError→422`.
- `database.py` — all SQLite access. Each function opens its own short-lived `connection()` (a context manager that enables foreign keys and commits/rolls back as a unit). No ORM.
- `ai.py` / `openrouter.py` — the AI seam (see below).

**Auth is a stateless signed cookie**, not server-side sessions. `_encode_session`/`_session_username` in `main.py` base64-encode a JSON payload (`username`, `expires_at`) and HMAC-SHA256 sign it with `SESSION_SECRET` (env, defaults to a dev value). Only the fixed `user`/`password` credentials are accepted. The data model already supports multiple users, but the MVP exposes exactly one.

**Board is normalized relational data, never a JSON blob.** Tables: `users` → one `boards` per user → fixed `columns` → `cards`, plus `conversation_messages`. Ordering within a column/conversation is an explicit `position INTEGER` with a `UNIQUE(parent, position)` constraint. Because of that uniqueness constraint, reorders can't just overwrite positions — `move_card` (and the AI `move_card` op) **temporarily parks the moved card at position `2_000_000` and shifts neighbors through a `+1_000_000` offset band** to avoid collisions before writing final positions. Deletes compact the trailing positions (`position - 1`). Preserve this pattern when touching ordering. Card fields are intentionally only `title` and `details`; the schema is meant to extend later (status, priority, timestamps, tags). Schema is documented in `docs/database-schema.json` and `docs/database.md`; DDL lives in `database.initialize()`, which also seeds the demo board on first run.

**Mutations return the whole board.** Every mutating `database` function ends by returning `board_for_user(...)`, so the frontend replaces its canonical board state from each response rather than patching locally.

**AI flow (`POST /api/ai/messages`):** load the user's board + last 10 messages → `build_provider_prompt` (embeds the board JSON, history, and the `ModelResult` JSON schema) → `OpenRouterClient.complete` → `parse_model_result` validates the response against Pydantic models (`reply` + a discriminated union of board operations). `apply_ai_result` re-validates every operation against the DB and session user, then applies all operations **and** appends the user+assistant messages inside a single `connection()`/transaction — malformed or unauthorized output makes no partial change. In automated tests the provider is always mocked; a real OpenRouter call is a manual smoke test only, never a test prerequisite.

**Frontend (`frontend/src/`):** Next.js 16 App Router + React 19. `lib/kanban.ts` holds the shared `Card`/`Column`/`BoardData` types and pure movement logic. Components: `KanbanBoard.tsx` (drag-and-drop via `@dnd-kit`, board state, API reconciliation), `KanbanColumn`/`KanbanCard`/`NewCardForm`, `AuthGate.tsx` (login), `AiChat.tsx` (sidebar). Unit tests are colocated `*.test.tsx`/`*.test.ts` (Vitest + Testing Library); Playwright browser tests live in `frontend/tests/`.

## Conventions

- Keep `.env` (holds `OPENROUTER_API_KEY`) out of images and git; never send the key or OpenRouter config to the frontend. Only AI routes require it.
- No emojis in product copy, docs, comments, or commits.
- Never commit secrets, the generated SQLite file, build output, or test artifacts.
