# Code Review

Reviewed 2026-07-20 against the working tree (branch `main`, HEAD `7cb1468` plus uncommitted changes to `database.py`, `main.py`, `openrouter.py`, `kanban.ts`).

This review is scoped to the current state of the code, with emphasis on the uncommitted refactor. It complements `docs/code_review.md`: where a finding overlaps, it is marked as such and re-confirmed against the code rather than restated on trust.

## Verification performed

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `uv run pytest` | 23 passed |
| Frontend unit tests | `npm run test:unit` | 12 passed (4 files) |
| Lint | `npm run lint` | clean |
| E2E | not re-run | `test-results/.last-run.json` records `"status": "failed"` |

Severity: **High** = correctness or security risk · **Medium** = should fix · **Low** = polish.

---

## The refactor itself: verdict

The uncommitted `database.py` change is a clear improvement and I would merge it. It removes roughly 90 lines of duplication by extracting `_rename_column` / `_create_card` / `_update_card` / `_delete_card` / `_move_card` as transaction-scoped helpers, then dispatching both the REST handlers (via `_mutate`) and the AI applier (via `_APPLY_OPERATION`) through the same code. Previously the reorder algorithm existed twice, character for character, in `move_card` and in the `apply_ai_result` branch — a duplication that was one edit away from the two paths silently disagreeing.

I traced the offset-band algorithm in `_move_card` against the old version for same-column moves in both directions, cross-column moves, and appends to the end. It is behaviour-preserving. The added comment at `backend/app/database.py:194` is the first explanation of that algorithm anywhere in the source and is worth keeping.

Two behavioural deltas fell out of the refactor, one of which is a real (if currently unreachable) regression — see L1 and L2.

---

## High

### H1. Session expiry leaves the UI permanently stuck with no route back to login
`frontend/src/components/AuthGate.tsx:15`, `frontend/src/components/KanbanBoard.tsx:39`, `frontend/src/components/AiChat.tsx:38`

`AuthGate` checks `/api/auth/session` exactly once, in a mount-time `useEffect`. Nothing re-checks afterwards, and no fetch call anywhere in the frontend inspects `response.status`. Sessions expire after 8 hours (`SESSION_MAX_AGE_SECONDS`, `main.py:21`).

When that happens, every `/api/*` call returns 401 from the auth middleware, and the user sees a generic "The board could not be updated. Try again." banner over a board that is now read-only in practice. Retrying does nothing. The AI sidebar shows "Unable to load conversation. Try again." with the same non-outcome. The only recovery is a manual page reload, which the error copy actively discourages by telling the user to try again.

Leaving a tab open overnight is the single most likely way to hit this, and it presents as "the app is broken" rather than "you are signed out".

**Action:** Centralize fetch handling so a 401 flips `AuthGate` back to `signed-out`. A shared helper that throws a typed `UnauthorizedError`, plus a callback threaded from `AuthGate` into `KanbanBoard` and `AiChat`, is enough. Add a unit test that mocks a 401 and asserts the login form returns.

### H2. `SESSION_SECRET` falls back to a hardcoded, source-visible value
`backend/app/main.py:22`

```python
SESSION_SECRET = os.environ.get("SESSION_SECRET", "local-development-session-secret")
```

Anyone who has read this repository can mint a valid `pm_session` cookie, because `_session_username` accepts any payload whose HMAC verifies. Defensible while the app is bound to localhost; an outright auth bypass the first time it is not.

Same finding as `docs/code_review.md` H1, still unaddressed. Noting it again because it remains the highest-impact issue in the codebase.

**Action:** Fail startup, or log a prominent warning, when `SESSION_SECRET` is unset. Pair it with L8 below.

---

## Medium

### M1. The AI request never asks the provider for JSON, but the parser demands it
`backend/app/openrouter.py:38`, `backend/app/ai.py:57`

The request payload is `{"model": ..., "messages": [...]}` — no `response_format`. Meanwhile `parse_model_result` calls `MODEL_RESULT_ADAPTER.validate_json(content)` on the raw string, so a response wrapped in a Markdown fence, or prefixed with "Sure, here's the JSON:", fails validation. The prompt asks for JSON only, but `openai/gpt-oss-120b` is not contractually bound by politeness.

The failure mode is bad: the user gets a 422 and the message "The AI provider returned an invalid structured response" for a request the model actually answered correctly.

**Action:** Send `"response_format": {"type": "json_object"}`, and defensively strip Markdown fences in `parse_model_result` before validating. Add a test with a fenced-JSON provider response.

### M2. Everything is crammed into a single `user` message
`backend/app/ai.py:64`

`build_provider_prompt` concatenates the role instructions, the JSON schema, the full board, the last 10 messages, and the user's text into one `user` message. Schema and role instructions belong in a `system` message; models follow structured-output instructions noticeably more reliably that way. This compounds M1 — fix them together.

### M3. Provider format failures are reported to the client as 422
`backend/app/main.py:252-259`

`parse_model_result` raises `ValueError`, which the `except (LookupError, ValueError)` block converts into a 422. But 4xx means the client sent something wrong, and the client did not: it sent a valid message and the upstream model returned malformed output. The frontend then displays that detail verbatim to the user (`AiChat.tsx:71`), so a provider hiccup reads as user error.

Worse, this block conflates two genuinely different cases: a malformed provider response (upstream's fault) and an AI operation that fails ownership or bounds validation (also not the user's fault, but a different bug class). Both land in the same handler with the same status.

**Action:** Map `parse_model_result` failures to 502 and keep 422 for operation validation failures. Distinguish the two in the caught exception types.

### M4. Test artifacts are committed, contradicting the repository's own rules
`frontend/test-results/`

`git ls-files` shows three tracked files under `frontend/test-results/`, including a 260 KB `trace.zip` that the working tree has already modified. `AGENTS.md` delivery rule 7 and `CLAUDE.md` both say never to commit test artifacts, and `.gitignore` has no entry for `test-results/` (or `out/`).

`test-results/.last-run.json` also records `"status": "failed"` for the drag-and-drop spec, so a failing run's artifacts are what is currently checked in.

**Action:** Add `frontend/test-results/` and `frontend/out/` to `.gitignore`, then `git rm -r --cached frontend/test-results`.

### M5. The drag-and-drop e2e test is failing
`frontend/tests/kanban.spec.ts:67`

Corroborated by `.last-run.json` and by the presence of an `error-context.md` for that spec. The test drives `@dnd-kit` with raw `page.mouse` coordinates, which is unreliable in headless Chromium against a sensor configured with `activationConstraint: { distance: 6 }`.

Also worth noting for anyone trying to run it: the spec signs in and exercises real API routes, so the default `next dev` server on port 3100 cannot serve it. It needs `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000` against the running container — and because that container holds a persistent SQLite volume, repeated runs mutate the seeded board and accumulate drift.

**Action:** Switch to the `@dnd-kit` keyboard sensor (focus, `Space`, arrows, `Space`) or Playwright's `dragTo` with explicit steps. Reset the volume between e2e runs. Document the `PLAYWRIGHT_BASE_URL` requirement in `CLAUDE.md`.

### M6. A drag attempted during an in-flight mutation is silently discarded
`frontend/src/components/KanbanBoard.tsx:59-62`

`runMutation` returns `false` immediately when `isMutating` is set, without setting an error. Combined with the absence of an optimistic update, the card simply snaps back to where it started and nothing explains why. Cards are also `disabled` while mutating (`KanbanColumn.tsx:68`), which narrows the window, but drops that begin before a slower request lands still vanish.

**Action:** Apply the already-computed `moveCard` result optimistically and reconcile with the server response, or at minimum surface a "please wait" message instead of failing mutely.

---

## Low

### L1. `_move_card` dropped the negative-position guard
`backend/app/database.py:186-191`

The old `move_card` rejected `target_position < 0` explicitly. The extracted `_move_card` only checks the upper bound (`target_position > max_position`). Not currently exploitable — both entry points constrain it (`CardMoveRequest.position` and `MoveCardOperation.position` both carry `Field(ge=0)`), and `CHECK (position >= 0)` in the schema is a third net. But `_move_card` is now a shared helper reachable from two callers and likely more later, and it no longer validates its own input. With a negative position it would corrupt ordering in the target column before the constraint fired.

**Action:** Restore `if target_position < 0: raise ValueError(...)` at the top of `_move_card`. One line, and it keeps the helper self-contained.

### L2. Error semantics shifted for out-of-range moves
`backend/app/database.py:191`

The old `move_card` folded `target_position < 0` into the `LookupError` ("Card or target column not found") branch, which surfaces as a 404. Out-of-range positions raised `ValueError` → 422. Post-refactor, the negative case is gone entirely (L1) and only the 422 path remains. No test covered the 404-for-negative behaviour, so nothing caught the change. Mentioned for the record — the new semantics are the better ones.

### L3. `initialData` is a test fixture living in production code
`frontend/src/lib/kanban.ts:18`

Confirmed by grep: `initialData` is referenced only by `AiChat.test.tsx`, `AuthGate.test.tsx`, and `KanbanBoard.test.tsx`. Nothing in the shipped app imports it — the board comes from `/api/board`. It is nonetheless bundled into the client build, and it duplicates the seed data that `database.DEMO_COLUMNS` owns canonically.

The working tree already deletes `createId` from this file, which I verified has zero remaining references. `initialData` is the same category of leftover, just with test callers attached.

**Action:** Move it to a shared test helper (`src/test/fixtures.ts`) and update the three imports. This also resolves `docs/code_review.md` L9, which flagged the deletion as blocked by those tests.

### L4. Column rename fires a request and a full board refetch on every blur
`frontend/src/components/KanbanColumn.tsx:53`

`onBlur` calls `onRename` unconditionally. Tabbing through the board issues a `PATCH` plus a whole-board reload per column, changing nothing. (Same as `docs/code_review.md` L2; confirmed still present.)

**Action:** Skip the call when the trimmed value equals `column.title`.

### L5. Clearing a column title leaves the UI showing a value the server rejected
`frontend/src/components/KanbanColumn.tsx:52`

The input is uncontrolled (`defaultValue`). Clear it, blur, and the client sends `""`; the backend rejects it via `min_length=1`; the error banner appears; the input keeps displaying empty. The UI now disagrees with the server until a reload. (Same as `docs/code_review.md` L3.)

### L6. `_session_username` ignores the username it just verified
`backend/app/main.py:87-89`

```python
if payload.get("username") != "user" or payload.get("expires_at", 0) < time.time():
    return None
return "user"
```

The literal `"user"` is checked and then returned, discarding the payload. Correct for a one-account MVP, and arguably a deliberate belt-and-braces choice. But the schema, `database.py`, and every ownership query are carefully multi-user; this function is the single place where that generality is hardcoded away, and it is not commented as such. Whoever adds a second account will find this at debugging time rather than design time.

**Action:** Return `payload["username"]` and let the database ownership joins do the authorization they already do, or add a comment marking this as the deliberate single-user chokepoint.

### L7. `POST /api/messages` accepts `role: "assistant"`
`backend/app/main.py:48-50`, `main.py:234`

Any authenticated caller can insert assistant-authored messages into the conversation, which are then fed back into subsequent AI prompts as trusted history. A prompt-injection vector that is currently inert because there is exactly one trusted user. (Same as `docs/code_review.md` L11.)

**Action:** Restrict the endpoint to `role: "user"` — `apply_ai_result` is the only thing that should write assistant turns — or document it as a testing affordance.

### L8. Cookie `secure` is hardcoded `False`
`backend/app/main.py:130`

Correct for local HTTP, wrong the moment anything terminates TLS in front of it. Drive it from the same "is this deployment local" signal that H2 needs.

### L9. Inconsistent `app` vs `request.app` access in the same function
`backend/app/main.py:244-248`

```python
board = database.board_for_user(app.state.database_path, username)   # module global
model_content = request.app.state.openrouter.complete(prompt)        # request-scoped
```

Both work. Mixing them in adjacent lines is the kind of thing that makes a future reader wonder whether the difference is meaningful. The refactor introduced the `request.app` form; pick one and apply it throughout.

### L10. `_mutate` re-reads the board on a second connection
`backend/app/database.py:233-236`

`_mutate` commits, then `board_for_user` opens a fresh connection to read the result back. The returned board is therefore not read inside the mutating transaction, so a concurrent writer could interleave and the caller would receive a board reflecting someone else's write. Irrelevant for a single-user MVP; a genuine correctness question if concurrency ever arrives. Same structure in `apply_ai_result`, which opens three connections per request.

### L11. A failed AI turn discards the user's message entirely
`backend/app/main.py:245-259`

The user's message is only persisted inside `apply_ai_result`, which runs after parsing succeeds. If the provider returns malformed JSON, nothing is written — the user's message never enters the conversation history, so the follow-up "what did I just ask?" has no record. The textarea does retain the text (`AiChat.tsx:76` only clears on success), so nothing is lost from the user's view, and the all-or-nothing transaction is deliberate and correct. Flagging only because the intent deserves a comment.

### L12. No test covers the new `OpenRouterClient.close()` or the lifespan wiring
`backend/app/openrouter.py:26`, `backend/app/main.py:91-98`

The working tree fixes a real client leak by hoisting `OpenRouterClient` into the lifespan and closing it on shutdown. Both are untested. A test asserting that `close()` is called on shutdown, and that `app.state.openrouter` is reused across requests rather than reconstructed, would keep someone from reintroducing per-request client construction later.

---

## What is working well

- **Authorization lives at the data layer.** Every mutation joins back through `boards.user_id`, so a card or column id belonging to another user cannot be touched regardless of which entry point supplied it. The refactor strengthens this by making the ownership checks unskippable — `_APPLY_OPERATION` cannot reach a mutation that bypasses them.
- **AI operations are genuinely atomic.** All operations plus both conversation messages commit in one transaction. Malformed or unauthorized model output leaves no partial state, and the tests cover the rollback path.
- **Provider errors are sanitized.** Every `OpenRouterError` message is user-safe; the API key and upstream response bodies never escape `openrouter.py`.
- **The ordering invariant is maintained rather than papered over.** Positions stay contiguous through deletes and moves, enforced by `UNIQUE(column_id, position)` and `CHECK(position >= 0)` rather than trusted to application code.
- **Secret hygiene holds.** `.env` is untracked and excluded from both git and the image; no OpenRouter configuration reaches the frontend.

---

## Suggested order

1. **H1** — session expiry lockout. Most likely issue a real user hits, and it presents as total breakage.
2. **H2** — enforce `SESSION_SECRET`.
3. **M1 + M2 + M3** — AI reliability and honest status codes. One coherent piece of work.
4. **M4 + M5** — untrack test artifacts, fix the failing drag spec.
5. **L1** — restore the negative-position guard before the refactor is committed. One line.
6. Everything else as time allows.
