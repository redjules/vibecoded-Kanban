# Frontend

## Purpose

This directory contains the existing Next.js 16 Kanban demo. It is currently a frontend-only, client-side application; the board state begins from `initialData` and is not yet connected to the FastAPI backend.

## Structure

- `src/app/`: App Router entry point, root layout, and global styles. `page.tsx` renders the board.
- `src/components/`: board, column, card, card preview, and new-card form components. `KanbanBoard.tsx` owns the current in-memory interaction state and drag-and-drop handlers.
- `src/lib/kanban.ts`: `Card`, `Column`, and `BoardData` types, demo seed data, card movement logic, and client ID generation.
- `src/**/*.test.tsx` and `src/**/*.test.ts`: Vitest unit tests for components and Kanban utilities.
- `tests/`: Playwright browser tests for board loading, card creation, and drag-and-drop.

## Commands

- `npm run dev`: start the Next.js development server.
- `npm run lint`: run ESLint.
- `npm run test:unit`: run Vitest once.
- `npm run test:e2e`: run Playwright against the local development server.
- `npm run build`: create a production build.

## Integration Guidance

Phase 3 will configure static export and package the generated site in the FastAPI container. Phase 7 will replace in-memory persistence with authenticated board API calls while preserving the current board interactions and visual style. Do not expose backend secrets or OpenRouter configuration to this application.
