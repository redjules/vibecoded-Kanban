# Backend

The backend is a Python 3.13 FastAPI application managed with `uv`.

- `app/main.py` defines the HTTP application and serves the temporary Phase 2 placeholder at `/`.
- API endpoints use the `/api/` prefix. `GET /api/health` is the container health smoke-test endpoint.
- `app/static/` contains temporary static files. Phase 3 will replace the placeholder with the exported Next.js site.
- `tests/` contains pytest API tests. Run them from this directory with `uv run pytest`.

Keep route handlers small and put persistence or provider logic in focused modules when those approved phases begin. Do not expose secrets through API responses or static files.
