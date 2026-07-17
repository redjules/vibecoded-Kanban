# Project Management MVP Plan

## Execution Rules

- This is an approval-gated plan. Do not start a phase until the preceding phase is complete and approved by the user.
- Mark checklist items complete only after their stated validation passes.
- Keep changes confined to the active phase. Record material design decisions in `docs/`.
- Use mocked network/provider behavior in automated tests. A real OpenRouter request is a manual smoke test, never a prerequisite for the normal test suite.

## Phase 1: Plan and Repository Orientation

**Goal:** establish the agreed delivery path and document the current frontend before implementation.

- [x] Review the root project requirements and existing plan.
- [x] Inspect the existing frontend's build configuration, board domain model, and test tooling.
- [x] Revise the root `AGENTS.md` with scope, constraints, quality rules, and approval gates.
- [x] Expand this plan with implementation checklists, tests, and success criteria.
- [x] Create `frontend/AGENTS.md` describing the existing Next.js application, components, state model, and test commands.
- [x] Resolve the database, seed-data, chat-history, card-field, and Docker Compose decisions.
- [x] Obtain explicit approval to begin Phase 2.

**Validation:** documentation review by the user.

**Success criteria:** the delivery sequence, approval points, test expectations, and unresolved decisions are clear enough to implement without inventing product requirements.

## Phase 2: Container and FastAPI Scaffold

**Goal:** prove the local container can serve a static page and a FastAPI endpoint.

- [x] Create the FastAPI application under `backend/` with `GET /api/health`.
- [x] Add Python project metadata and a `uv.lock`-based dependency workflow.
- [x] Add a minimal static placeholder served by FastAPI at `/`.
- [x] Add a multi-stage Docker build that installs Python dependencies with `uv` and exposes the application port.
- [x] Add `.dockerignore` and environment-file handling that keeps `.env` out of images and version control.
- [x] Add documented start/stop scripts for macOS/Linux and Windows in `scripts/`, using `docker compose`.
- [x] Add backend tests for the health endpoint and static route.
- [x] Build the container and verify both routes from the host.

**Validation:** backend test command; `docker build`; start script; HTTP checks for `/` and `/api/health`.

**Success criteria:** `docker compose` starts the app locally, `/` returns the placeholder page, and `/api/health` returns a successful JSON response.

## Phase 3: Static Next.js Board Delivery

**Goal:** replace the placeholder with the existing Kanban demo, statically built and served by FastAPI.

- [x] Configure Next.js static export and make the export directory an explicit Docker build artifact.
- [x] Copy the exported assets into the FastAPI static-serving location during the image build.
- [x] Configure FastAPI static routing so client assets resolve correctly and `/` serves the board.
- [x] Preserve the existing board behaviors: display five columns, rename columns, add/delete cards, and drag cards between columns.
- [x] Adjust the existing Playwright configuration or add container-oriented browser coverage so the delivered static build is tested rather than only `next dev`.
- [x] Run frontend lint, unit tests, production build, and browser tests.
- [x] Verify the same board from the running container.

**Validation:** `npm run lint`; `npm run test:unit`; `npm run build`; browser tests against the delivered app; container smoke test.

**Success criteria:** the container serves the current Kanban UI at `/`, static assets load without 404s, and existing board interactions pass automated coverage.

## Phase 4: MVP Authentication

**Goal:** require the fixed MVP credentials before exposing the board and support logout.

- [ ] Define the minimal session approach (recommended: signed, HTTP-only cookie) and document its lifetime and local-only limits.
- [ ] Add `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/session`.
- [ ] Authenticate only `user` / `password`; return an appropriate failure response for invalid credentials.
- [ ] Protect board and AI API routes; serve the login experience when no valid session exists.
- [ ] Add a login form and logout control consistent with the existing visual system.
- [ ] Test valid login, rejected login, protected-route rejection, session restoration, and logout.

**Validation:** backend auth tests; frontend unit tests; Playwright login/logout flows; container smoke test with and without session cookie.

**Success criteria:** unauthenticated visitors cannot read or change board data, the fixed credentials enable the board, and logout returns the user to the login screen.

## Phase 5: Persistence Design Approval

**Goal:** agree the SQLite data model before writing database code.

- [ ] Write `docs/database-schema.json` as documentation describing tables, columns, types, keys, and indexes; store board data in normal SQLite tables, not a JSON blob.
- [ ] Write a concise `docs/database.md` explaining ownership, ordering, initialization, and the relationship between the JSON schema document and SQLite DDL.
- [ ] Model users, one board per user, fixed-position columns, cards, card ordering within a column, and persisted AI conversation messages.
- [ ] Define deletion/update behavior and order-maintenance rules for moving cards.
- [ ] Seed the fixed MVP user with the current frontend demo board data.
- [ ] Model card `title` and `details` as the only MVP fields while leaving the schema easy to extend with status, priority, timestamps, and tags.
- [ ] Review the schema with the user and obtain explicit approval.

**Validation:** JSON parses successfully; schema review.

**Success criteria:** an approved relational schema supports future users, exactly one board per user for the MVP, renamed fixed columns, ordered cards, persisted chat messages, and atomic card moves.

## Phase 6: Persistent Board API

**Goal:** implement database initialization and authenticated APIs for the agreed board model.

- [ ] Add SQLite connection, schema initialization, and seed logic that runs safely when the database file is absent.
- [ ] Persist and retrieve the authenticated user's conversation messages.
- [ ] Implement authenticated board read endpoint(s) scoped to the session user.
- [ ] Implement validated mutations for column rename, card create/edit/delete, and card reorder/move.
- [ ] Keep a card move and its resulting order updates atomic.
- [ ] Return response shapes that let the frontend replace its canonical board state after each successful mutation.
- [ ] Add service and API tests using an isolated temporary SQLite database.
- [ ] Test authorization boundaries even though the MVP login exposes one account.

**Validation:** focused backend tests covering initialization, seeding, all mutations, ordering, validation, and unauthorized responses.

**Success criteria:** a new database is created automatically; authenticated mutations persist across application restarts; invalid requests do not corrupt board ordering or another user's data.

## Phase 7: Persistent Frontend Integration

**Goal:** make the board use the persistent API rather than local demo state.

- [ ] Replace initial in-memory board loading with authenticated API loading, retaining the existing client-side interaction model where appropriate.
- [ ] Send every approved UI mutation to the API and reconcile the returned canonical board state.
- [ ] Add explicit loading, empty/error, and mutation-failure states that keep the board usable and understandable.
- [ ] Prevent duplicate mutation submission while a specific request is pending.
- [ ] Update unit tests for API-backed state transitions.
- [ ] Add browser tests that exercise persistence through the running FastAPI app and verify data survives reload.

**Validation:** frontend lint/unit/build; backend tests; end-to-end tests against the integrated container.

**Success criteria:** all board changes made through the UI persist after refresh and are visible only within the authenticated user's board.

## Phase 8: OpenRouter Connectivity

**Goal:** add a backend-only OpenRouter client and verify configuration with a bounded smoke test.

- [ ] Add configuration loading that requires `OPENROUTER_API_KEY` only for AI routes and never sends it to the browser.
- [ ] Implement a small provider client using `openai/gpt-oss-120b` and configured timeouts.
- [ ] Add a backend-only diagnostic or test seam for a simple `2 + 2` request; do not expose a general diagnostic endpoint in the UI.
- [ ] Mock the provider in automated tests for request construction, errors, and timeouts.
- [ ] With user approval and a locally configured key, perform one manual connectivity check and record only the pass/fail result.

**Validation:** mocked provider tests; optional approved manual OpenRouter smoke test.

**Success criteria:** the backend can call the selected model when configured, failures are handled without exposing secrets, and normal CI does not depend on external AI availability.

## Phase 9: Structured AI Board Operations

**Goal:** let the model respond to a user message with typed chat content and optional validated board operations.

- [ ] Define a JSON schema for the model result: assistant reply plus zero or more board operations.
- [ ] Define supported operations precisely: create card, edit card, delete card, move/reorder card, and rename column.
- [ ] Include the current user's board JSON, the user message, and bounded conversation history in the provider request.
- [ ] Validate every returned operation on the server against the current database state and session user before applying it.
- [ ] Apply all accepted operations atomically; reject invalid model output without partial board changes.
- [ ] Persist conversation history in SQLite and include the bounded stored history in the provider request.
- [ ] Add tests for reply-only output, each operation type, multiple operations, invalid structured output, and provider errors.

**Validation:** schema validation tests; mocked model-response API tests; SQLite atomicity tests.

**Success criteria:** a valid model response can update one or more board elements reliably, while malformed or unauthorized operations cannot alter persisted data.

## Phase 10: AI Chat Sidebar

**Goal:** deliver the authenticated AI chat experience and synchronize validated AI changes into the board.

- [ ] Add a responsive, persistent chat sidebar that follows the established board visual style.
- [ ] Render conversation messages, sending state, provider error state, and retry behavior.
- [ ] Submit questions to the structured AI endpoint.
- [ ] Refresh the board from the API response after accepted AI operations without a full-page reload.
- [ ] Ensure ordinary chat replies do not trigger an unnecessary board refresh.
- [ ] Add unit tests for chat state and browser tests for reply-only and board-changing conversations using mocked backend responses.
- [ ] Run complete frontend, backend, and container validation.

**Validation:** frontend lint/unit/build; backend tests; browser tests; Docker build/run smoke test.

**Success criteria:** an authenticated user can chat in the sidebar; the assistant's text is displayed; validated board updates appear immediately and persist after refresh.

## Resolved Design Decisions

- `docs/database-schema.json` documents the schema. The application stores board data in normal relational SQLite tables, not one JSON blob.
- The fixed `user` is initialized with the current demo board data.
- AI conversation history persists in SQLite and remains available after page reloads and browser restarts.
- Cards have `title` and `details` only for the MVP. The data model should remain easy to extend with status, priority, timestamps, and tags.
- Start and stop scripts use `docker compose` as the common developer interface.
