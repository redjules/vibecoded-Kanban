# Code Review

Comprehensive review of the Project Management MVP (FastAPI + static Next.js, SQLite, OpenRouter AI). Reviewed on 2026-07-20 against `main` (HEAD `eb99ed`, plus subsequent commits up to `7cb1468`).

## Summary

The codebase is well-structured, readable, and follows the phased plan in `docs/PLAN.md`. Backend persistence, authorization boundaries, and the atomic AI-operation flow are solid. Test coverage is good (23 backend + 12 frontend unit tests). The existing review from 2026-07-18 noted several findings; M2 (httpx client leak), M3 (duplicated reorder logic), and M4 (deprecated `@app.on_event("startup")`) have been fixed in the current code. Findings below are updated, with new issues flagged.

Severity legend: **High** = correctness/security risk · **Medium** = should fix · **Low** = polish / nice-to-have.

---

## High

### H1. `SESSION_SECRET` silently falls back to a public hardcoded value
`backend/app/main.py:22`

```python
SESSION_SECRET = os.environ.get("SESSION_SECRET", "local-development-session-secret")
```

Anyone who knows the fallback can forge a valid `pm_session` cookie and bypass auth entirely, since `_session_username` trusts any payload with a matching HMAC. Acceptable for a purely local MVP, but the moment the app is exposed on a network this is a real auth bypass.

**Action:** Raise a loud warning or fail when `SESSION_SECRET` is unset and the app is not clearly local. At minimum document in `docs/authentication.md` that the app must not be exposed beyond localhost without setting a secret. The file already mentions the limitation — enforce it rather than relying on the reader.

---

## Medium

### M1. AI provider response is not constrained to JSON; valid-looking replies can fail
`backend/app/openrouter.py:34`, `backend/app/ai.py:57`

The prompt asks for "JSON only" but the request does not set `response_format`, and `parse_model_result` does a strict `validate_json` on raw content. `openai/gpt-oss-120b` commonly wraps JSON in Markdown fences or prepends prose, causing a 422 for what was actually a correct answer.

**Action:** Set `"response_format": {"type": "json_object"}` in the `OpenRouterClient.complete` payload and/or strip Markdown fences before parsing in `parse_model_result`. Add a test with a fenced-JSON provider response.

### M2 (NEW). No system message in AI prompt reduces instruction-following reliability
`backend/app/ai.py:64`

The prompt concatenates the schema, board JSON, conversation history, and user message into a single `user` message. Using a dedicated `system` message for role/schema instructions is more reliable for structured output adherence.

**Action:** When fixing M1, split the schema/role instructions into a `system` message and keep only the user's text in the `user` message. This was previously L7 but should be Medium given its direct impact on AI reliability.

### M3 (NEW). Missing `.env.example` documents required secrets
Project root

The `.gitignore` excludes `.env`, but no `.env.example` or `.env.template` exists. A developer cloning the repo must dig through source code to discover that `OPENROUTER_API_KEY` and optionally `SESSION_SECRET` are needed.

**Action:** Add `.env.example` with placeholders for `OPENROUTER_API_KEY` and `SESSION_SECRET`, plus brief comments about each.

### M4 (NEW). No token-count awareness in AI prompt construction
`backend/app/main.py:245`

```python
history = database.messages_for_user(app.state.database_path, username)[-10:]
```

The last 10 messages are included without any token counting. If messages are long (up to 10k chars each), the prompt could exceed the model's context window and cause a silent truncation or error.

**Action:** Add a rough token estimate (e.g. 4 chars per token) and truncate history to stay within a safe margin of the model's context limit. Or at minimum document the known limitation for the chosen model.

---

## Low

### L1. Dead / duplicated seed data in the frontend
`frontend/src/lib/kanban.ts:18` (`initialData`) and `frontend/src/lib/kanban.ts:164` (`createId`)

Both are exported but unused in production code. `initialData` duplicates the canonical seed in `backend/app/database.py`. The backend is the single source of truth.

**Action:** Delete `initialData` and `createId` if truly unused, or move `initialData` into the test file that needs it. If deleting, update `KanbanBoard.test.tsx` and `AiChat.test.tsx` which both import it.

### L2. Column rename sends a request (and full board refetch) on every blur, even with no change
`frontend/src/components/KanbanColumn.tsx:53`

Tabbing through or clicking into and out of the title input fires a `PATCH /api/columns/{id}` plus a full board reload each time, regardless of whether the title changed.

**Action:** In `onBlur`, skip the request when the trimmed value equals `column.title`.

### L3. Emptying a column title diverges UI from server
`frontend/src/components/KanbanColumn.tsx:51`, `backend/app/main.py:31`

The title `<input>` uses `defaultValue` (uncontrolled). If the user clears it and blurs, the client sends `""`, the backend rejects it (`min_length=1`), the error banner shows, but the input still displays the empty string until reload.

**Action:** Guard against empty titles client-side, or make the input controlled so failed edits revert visibly.

### L4. Cookie `secure` flag is hardcoded `False`
`backend/app/main.py:130`

Correct for local HTTP, but means the session cookie would be sent over plaintext if the app were ever served over HTTPS.

**Action:** Drive `secure` from an environment flag, reusing the same "is this local" signal as H1.

### L5. `moveCard` optimistic result is computed then discarded
`frontend/src/components/KanbanBoard.tsx:91`

`handleDragEnd` computes `nextColumns` via the pure `moveCard` helper only to derive the target column id and index for the API call; it never applies the optimistic state, instead waiting for the server's canonical board. This means a visible latency between drop and re-render.

**Action:** Either apply `setBoard` optimistically before the request (reconciling with server response) for snappier UX, or add a comment noting the intentional server-authoritative choice.

### L6. Playwright `moves a card between columns` test is unreliable
`frontend/tests/kanban.spec.ts:67`

The test uses raw `page.mouse` coordinates which does not reliably trigger the `@dnd-kit` pointer sensor in headless Chromium. It also writes to the persistent SQLite volume, so repeated runs accumulate board drift.

**Action:** Use a more robust drag method (e.g. keyboard sensor: focus, `Space`, arrow keys, `Space`), and reset the DB between e2e runs (`docker volume rm pm_project-management-data`).

### L7. Magic numbers in the reorder algorithm
`backend/app/database.py:212-228`

`2_000_000` / `1_000_000` / `999_999` encode an implicit assumption of fewer than ~1M cards per column and are unexplained.

**Action:** Consider the simpler alternative of renumbering the affected column(s) to a contiguous 0..n sequence inside the transaction. If keeping the current approach, add a one-line comment explaining the offset bands.

### L8. Root and backend maintain duplicate `pyproject.toml` / `uv.lock`
`pyproject.toml` and `backend/pyproject.toml`

Two separate uv environments with the same dependencies; running `uv run pytest` while `backend/.venv` is active emits a `VIRTUAL_ENV does not match` warning.

**Action:** Document the two-environment split (partially done in `CLAUDE.md`) and/or standardize on one.

### L9 (NEW). `KanbanBoard.test.tsx` depends on `initialData` which is suggested for deletion
`frontend/src/components/KanbanBoard.test.tsx:5`

The test suite imports `initialData` from `@/lib/kanban` and uses it as the mock API response. If L1 is implemented and `initialData` is deleted, these tests would break.

**Action:** Either keep `initialData` as a shared test fixture (move it to a test helper file), or have each test define its own minimal mock data.

### L10 (NEW). Dual connection per mutation (minor inefficiency)
`backend/app/database.py:233-236`

`_mutate` opens a connection for the mutation, then `board_for_user` opens a second connection to re-read the board. For SQLite this is fine, but the re-read could share the same connection since it's called right after the commit.

**Action:** Pass the board read through the same connection when possible, or keep as-is since the overhead is negligible for an MVP.

### L11 (NEW). `POST /api/messages` allows injecting arbitrary assistant messages
`backend/app/main.py:233-238`

The general-purpose `POST /api/messages` endpoint accepts `role: "assistant"` from any authenticated user. While only the trusted MVP user exists, this allows polluting the AI conversation history with injected messages that will be fed into future AI prompts.

**Action:** Either restrict the endpoint to `role: "user"` only (AI responses are stored by `apply_ai_result`), or document it as a known testing convenience.

---

## Fixed Since Previous Review

- **M2 (httpx client leak):** `OpenRouterClient` is now created once during startup and closed in the lifespan `finally` block. Fixed.
- **M3 (duplicated reorder logic):** `_move_card` is extracted as a shared private helper; both REST handlers and `apply_ai_result` call it through `_APPLY_OPERATION`. Fixed.
- **M4 (deprecated `@app.on_event("startup")`):** Migrated to `lifespan` async context manager. Fixed.

---

## Documentation

### D1. `docs/PLAN.md` Phase 10 is unchecked but the code exists
`docs/PLAN.md:152`

The AI chat sidebar and `POST /api/ai/messages` are implemented and tested, yet Phase 10 items remain unchecked.

**Action:** Reconcile the checklist with reality.

---

## What's good (keep doing)

- **Authorization is enforced at the data layer.** Every `database` mutation joins back through `boards.user_id`, so a card/column id from another user cannot be touched even though the MVP exposes one account. Tests cover the unauthorized paths.
- **AI operations are atomic.** `apply_ai_result` applies all operations and appends messages inside one transaction; rollback tests confirm malformed output leaves no partial state.
- **Provider failures are sanitized.** `OpenRouterError` messages are user-safe and never leak the key or upstream internals.
- **Secret hygiene.** `.env` is untracked and in both `.gitignore` and `.dockerignore`; the key is never sent to the frontend.
- **Relational schema, not a JSON blob**, with contiguous `position` ordering enforced by unique composite indexes. Matches `docs/database-schema.json`.
- **Clean component separation.** The frontend cleanly splits Kanban concerns into focused components (`KanbanBoard`, `KanbanColumn`, `KanbanCard`, `NewCardForm`, `AiChat`, `AuthGate`), each with its own responsibility and test file.
- **Thorough backend test coverage** including AI rollback, invalid structured output, boundary checks, and provider errors.

---

## Suggested priority order

1. H1 — guard/enforce `SESSION_SECRET` (auth integrity).
2. M1 + M2 — make provider JSON parsing robust and add a system message for reliable structured output (biggest reliability win for the AI feature).
3. M3 — add `.env.example` to reduce onboarding friction.
4. M4 — add token-count awareness to prevent context overflow.
5. L2, L3, L4, L7, L5, L6, L8, L9, L10, L11 — polish as time permits.
