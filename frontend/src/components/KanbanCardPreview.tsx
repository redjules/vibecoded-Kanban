import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="cursor-grabbing rounded-xl border border-[var(--stroke-strong)] bg-white py-3 pl-4 pr-3 shadow-[0_18px_32px_rgba(3,33,71,0.16)]">
    <h4 className="break-words font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
      {card.title}
    </h4>
    {card.details ? (
      <p className="mt-1 break-words text-xs leading-5 text-[var(--gray-text)]">
        {card.details}
      </p>
    ) : null}
  </article>
);
