import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";
import { TrashIcon } from "@/components/icons";

type KanbanCardProps = {
  card: Card;
  accent: string;
  onDelete: (cardId: string) => Promise<void>;
  disabled: boolean;
};

export const KanbanCard = ({
  card,
  accent,
  onDelete,
  disabled,
}: KanbanCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative min-w-0 cursor-grab rounded-xl border border-[var(--stroke)] bg-white py-3 pl-4 pr-2 shadow-[var(--shadow-soft)]",
        "transition-all duration-150 hover:border-[var(--stroke-strong)] hover:shadow-[0_10px_24px_rgba(3,33,71,0.10)]",
        isDragging && "opacity-50",
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[3px] rounded-full opacity-70"
        style={{ backgroundColor: accent }}
      />
      <div className="flex min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1">
          <h4 className="break-words font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
            {card.title}
          </h4>
          {card.details ? (
            <p className="mt-1 break-words text-xs leading-5 text-[var(--gray-text)]">
              {card.details}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void onDelete(card.id)}
          disabled={disabled}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--gray-text)] opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed"
          aria-label={`Delete ${card.title}`}
          title={`Delete ${card.title}`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
};
