"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AiChat } from "@/components/AiChat";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { BoardIcon, LogoutIcon, SparkIcon } from "@/components/icons";
import { moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  onLogout?: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isMutating, setIsMutating] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);

  const requestBoard = async (path: string, options?: RequestInit) => {
    setError("");
    const response = await fetch(path, { credentials: "include", ...options });
    if (!response.ok) {
      throw new Error("The board could not be updated. Try again.");
    }
    const nextBoard = (await response.json()) as BoardData;
    setBoard(nextBoard);
  };

  useEffect(() => {
    const loadBoard = async () => {
      try {
        await requestBoard("/api/board");
      } catch {
        setError("The board could not be loaded. Refresh and try again.");
      }
    };

    void loadBoard();
  }, []);

  const runMutation = async (operation: () => Promise<void>) => {
    if (isMutating) {
      return false;
    }
    setIsMutating(true);
    try {
      await operation();
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "The board could not be updated. Try again.",
      );
    } finally {
      setIsMutating(false);
    }
    return false;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const nextColumns = moveCard(
      board.columns,
      active.id as string,
      over.id as string,
    );
    const targetColumn = nextColumns.find((column) =>
      column.cardIds.includes(active.id as string),
    );
    if (!targetColumn) {
      return;
    }

    void runMutation(() =>
      requestBoard(`/api/cards/${active.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          column_id: Number(targetColumn.id),
          position: targetColumn.cardIds.indexOf(active.id as string),
        }),
      }),
    );
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    void runMutation(() =>
      requestBoard(`/api/columns/${columnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }),
    );
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string,
  ) => {
    return runMutation(() =>
      requestBoard(`/api/columns/${columnId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, details }),
      }),
    );
  };

  const handleDeleteCard = async (cardId: string) => {
    await runMutation(() =>
      requestBoard(`/api/cards/${cardId}`, { method: "DELETE" }),
    );
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;
  const totalCards = Object.keys(cardsById).length;

  if (!board) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--gray-text)]">
        {error || "Loading board..."}
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--surface)]">
      <header className="z-20 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--stroke)] bg-[var(--surface-strong)] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--navy-dark)] text-white">
            <BoardIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-semibold leading-tight text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
            <p className="truncate text-xs font-medium text-[var(--gray-text)]">
              Single board workspace
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)]">
            {board.columns.length} columns
          </span>
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)]">
            {totalCards} cards
          </span>
          {isMutating ? (
            <span className="text-xs font-semibold text-[var(--primary-blue)]">
              Saving...
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            aria-pressed={isChatOpen}
            className={clsx(
              "flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
              isChatOpen
                ? "border-transparent bg-[var(--secondary-purple)] text-white"
                : "border-[var(--stroke-strong)] text-[var(--navy-dark)] hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)]",
            )}
            onClick={() => setIsChatOpen((previous) => !previous)}
            type="button"
          >
            <SparkIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Assistant</span>
          </button>
          {onLogout ? (
            <button
              aria-label="Log out"
              className="grid h-9 w-9 place-items-center rounded-full border border-[var(--stroke-strong)] text-[var(--gray-text)] transition hover:border-red-300 hover:text-red-600"
              onClick={onLogout}
              title="Log out"
              type="button"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <p
          className="shrink-0 border-b border-red-200 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="scroll-slim min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-5 py-5">
            <section className="flex h-full w-full items-stretch gap-4">
              {board.columns.map((column, index) => (
                <KanbanColumn
                  key={column.id}
                  accentIndex={index}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  isMutating={isMutating}
                />
              ))}
            </section>
          </div>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[280px] rotate-2">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {isChatOpen ? (
          <AiChat
            onBoardUpdate={setBoard}
            onClose={() => setIsChatOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
};
