"use client";

import { FormEvent, useEffect, useState } from "react";
import type { BoardData } from "@/lib/kanban";
import { CloseIcon, SendIcon, SparkIcon } from "@/components/icons";

type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AiMessageResponse = {
  messages: ConversationMessage[];
  board: BoardData;
  operationsApplied: number;
};

type ApiErrorResponse = {
  detail?: string;
};

type AiChatProps = {
  onBoardUpdate: (board: BoardData) => void;
  onClose?: () => void;
};

export const AiChat = ({ onBoardUpdate, onClose }: AiChatProps) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const response = await fetch("/api/messages", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Unable to load conversation.");
        }
        setMessages((await response.json()) as ConversationMessage[]);
      } catch {
        setError("Unable to load conversation. Try again.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadMessages();
  }, []);

  const sendMessage = async () => {
    const nextContent = content.trim();
    if (!nextContent || isSending) {
      return;
    }

    setError("");
    setIsSending(true);
    try {
      const response = await fetch("/api/ai/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextContent }),
      });
      if (!response.ok) {
        const errorResponse = (await response.json()) as ApiErrorResponse;
        throw new Error(
          errorResponse.detail || "The assistant could not respond. Try again.",
        );
      }

      const result = (await response.json()) as AiMessageResponse;
      setMessages(result.messages);
      setContent("");
      if (result.operationsApplied > 0) {
        onBoardUpdate(result.board);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The assistant could not respond. Try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 flex w-[min(100%,360px)] flex-col border-l border-[var(--stroke)] bg-[var(--surface-strong)] shadow-[var(--shadow)] md:static md:z-auto md:w-[340px] md:shrink-0 md:shadow-none lg:w-[380px]"
      aria-label="AI project assistant"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--stroke)] px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--secondary-purple)]/10 text-[var(--secondary-purple)]">
          <SparkIcon className="h-4 w-4" />
        </span>
        <h2 className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-[var(--navy-dark)]">
          Project assistant
        </h2>
        {onClose ? (
          <button
            aria-label="Close assistant"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
            onClick={onClose}
            title="Close assistant"
            type="button"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      <div
        className="scroll-slim flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {isLoading ? (
          <p className="text-sm text-[var(--gray-text)]">
            Loading conversation...
          </p>
        ) : null}
        {!isLoading && messages.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            What would you like to change on the board?
          </p>
        ) : null}
        {messages.map((message) => (
          <article
            key={message.id}
            className={
              message.role === "assistant"
                ? "mr-4 rounded-xl rounded-tl-sm bg-[var(--surface)] px-3 py-2"
                : "ml-4 rounded-xl rounded-tr-sm bg-[var(--primary-blue)]/10 px-3 py-2"
            }
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
              {message.role === "assistant" ? "Assistant" : "You"}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--navy-dark)]">
              {message.content}
            </p>
          </article>
        ))}
      </div>

      <form
        className="shrink-0 border-t border-[var(--stroke)] p-4"
        onSubmit={handleSubmit}
      >
        <label className="sr-only" htmlFor="ai-message">
          Message the project assistant
        </label>
        <textarea
          className="min-h-20 w-full resize-y rounded-lg border border-[var(--stroke-strong)] bg-white px-3 py-2 text-sm leading-6 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          id="ai-message"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Ask about this board"
          disabled={isSending}
          required
        />
        {error ? (
          <div
            className="mt-3 flex items-center justify-between gap-3"
            role="alert"
          >
            <p className="text-sm text-red-700">{error}</p>
            <button
              className="shrink-0 text-sm font-semibold text-[var(--secondary-purple)] underline underline-offset-4"
              onClick={() => void sendMessage()}
              type="button"
              disabled={isSending}
            >
              Retry
            </button>
          </div>
        ) : null}
        <button
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSending || !content.trim()}
        >
          <SendIcon className="h-4 w-4" />
          {isSending ? "Sending..." : "Send message"}
        </button>
      </form>
    </aside>
  );
};
