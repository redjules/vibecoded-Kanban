import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

const accents = [
  "var(--primary-blue)",
  "var(--secondary-purple)",
  "var(--accent-yellow)",
  "var(--navy-dark)",
  "#2fa37a",
];

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  accentIndex: number;
  onRename: (columnId: string, title: string) => void;
  onAddCard: (
    columnId: string,
    title: string,
    details: string,
  ) => Promise<boolean>;
  onDeleteCard: (cardId: string) => Promise<void>;
  isMutating: boolean;
};

export const KanbanColumn = ({
  column,
  cards,
  accentIndex,
  onRename,
  onAddCard,
  onDeleteCard,
  isMutating,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const accent = accents[accentIndex % accents.length];

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex h-full min-w-[244px] flex-1 basis-[244px] flex-col rounded-2xl border bg-[var(--surface-strong)] shadow-[var(--shadow-soft)] transition",
        isOver
          ? "border-[var(--primary-blue)] ring-2 ring-[var(--primary-blue)]/25"
          : "border-[var(--stroke)]",
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="shrink-0 rounded-t-2xl border-b border-[var(--stroke)] px-3 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <span
            className="h-6 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <input
            defaultValue={column.title}
            onBlur={(event) => onRename(column.id, event.target.value.trim())}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 font-display text-sm font-semibold text-[var(--navy-dark)] outline-none transition hover:bg-[var(--surface)] focus:bg-[var(--surface)]"
            aria-label="Column title"
          />
          <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--gray-text)]">
            {cards.length}
          </span>
        </div>
      </div>

      <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        <SortableContext
          items={column.cardIds}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              accent={accent}
              onDelete={onDeleteCard}
              disabled={isMutating}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--stroke-strong)] px-3 py-8 text-center text-xs font-semibold text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pb-3">
        <NewCardForm
          onAdd={(title, details) => onAddCard(column.id, title, details)}
          disabled={isMutating}
        />
      </div>
    </section>
  );
};
