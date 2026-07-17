# Project Management MVP

## Product Scope

Build a local, Docker-packaged project-management application with the following MVP workflow:

- A user signs in with the fixed credentials `user` / `password`.
- An authenticated user sees one Kanban board for their account.
- The board has a fixed number of columns; users can rename columns.
- Users can create, edit, delete, reorder, and drag cards between columns.
- Changes persist in normal, relational SQLite tables; do not store an entire board as a JSON blob.
- A sidebar chat lets the user ask an AI to create, edit, move, or delete one or more cards. The AI can also answer without changing the board.

Multiple users must be supported in the data model even though the MVP exposes only the single fixed account. Each user has exactly one board for this MVP. The fixed user starts with the current demo board data. Cards contain only `title` and `details` in this MVP; keep the schema straightforward to extend with status, priority, timestamps, and tags later.

## Technical Constraints

- Frontend: Next.js, statically exported and served by the FastAPI application at `/`.
- Backend: Python FastAPI.
- Runtime: one local Docker container.
- Python package management in the container: `uv`.
- Database: SQLite, with database creation and schema initialization on first run. Document the relational schema separately in `docs/database-schema.json`.
- AI provider: OpenRouter, using `openai/gpt-oss-120b`.
- Secret handling: read `OPENROUTER_API_KEY` from the project-root `.env`; never commit the value or expose it to the frontend.
- Scripts: provide start and stop scripts for macOS/Linux and Windows under `scripts/`, using `docker compose` as the common interface.

## Existing Starting Point

`frontend/` contains a working, frontend-only Kanban demo. It has a client-side board seeded from `initialData`, supports column renaming, card creation/deletion, and drag-and-drop movement. It already includes Vitest unit tests and Playwright browser tests. Preserve its visual language and reuse its existing Kanban domain types where practical; replace in-memory persistence only when the backend integration phase is approved.

Persist AI conversation history in SQLite so it remains available after page reloads and browser restarts.

## Visual Direction

- Accent yellow: `#ecad0a` for highlights and status accents.
- Primary blue: `#209dd7` for links and key sections.
- Secondary purple: `#753991` for primary submit and important actions.
- Dark navy: `#032147` for principal headings.
- Gray: `#888888` for supporting text and labels.

The authenticated board should remain compact and task-focused. The AI chat belongs in a persistent sidebar, not a separate marketing-style screen.

## Delivery Rules

1. Treat [docs/PLAN.md](docs/PLAN.md) as the execution checklist. Do not begin an unapproved phase.
2. Complete one phase at a time. Run that phase's validation commands before requesting approval for the next phase.
3. Identify a failure's root cause with evidence before changing code. Do not guess at fixes.
4. Keep the implementation simple and narrowly scoped. Do not add accounts, boards, integrations, or deployment targets beyond this MVP.
5. Use current stable, idiomatic library APIs compatible with the existing project. Pin or lock dependencies through the appropriate package manager files.
6. Keep documentation concise and place planning and design decisions in `docs/`.
7. Never commit secrets, generated database files, build output, or test artifacts.
8. Use no emojis in product copy, documentation, source comments, or commits.

## Required Quality Checks

- Frontend: lint, unit tests, production build, and browser tests for changed user workflows.
- Backend: focused API/service tests and a FastAPI startup smoke test for changed backend behavior.
- Container: build and run the image, then verify the static UI and an API endpoint from the host.
- AI: mock provider responses in normal automated tests. Run a real OpenRouter connectivity smoke test only when an API key is available and explicitly requested for the approved AI phase.

## Working Documentation

All planning and design documents live in `docs/`. Review and obtain approval for [docs/PLAN.md](docs/PLAN.md) before implementation. Record the approved database design in `docs/` before creating persistence code.
