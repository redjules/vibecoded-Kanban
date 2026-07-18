"use client";

import { FormEvent, useEffect, useState } from "react";
import type { BoardData } from "@/lib/kanban";

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
};

export const AiChat = ({ onBoardUpdate }: AiChatProps) => {
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
      className="flex min-h-[540px] flex-col border border-[var(--stroke)] bg-white/90 shadow-[var(--shadow)] backdrop-blur lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]"
      aria-label="AI project assistant"
    >
      <header className="border-b border-[var(--stroke)] px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary-blue)]">
          Project assistant
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--navy-dark)]">
          Board chat
        </h2>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"
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
                ? "border-l-2 border-[var(--accent-yellow)] bg-[var(--surface)] px-4 py-3"
                : "ml-6 border-l-2 border-[var(--primary-blue)] px-4 py-3"
            }
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)]">
              {message.role === "assistant" ? "Assistant" : "You"}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--navy-dark)]">
              {message.content}
            </p>
          </article>
        ))}
      </div>

      <form
        className="border-t border-[var(--stroke)] p-5"
        onSubmit={handleSubmit}
      >
        <label className="sr-only" htmlFor="ai-message">
          Message the project assistant
        </label>
        <textarea
          className="min-h-24 w-full resize-y border border-[var(--stroke)] bg-white px-3 py-2 text-sm leading-6 text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
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
          className="mt-4 w-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSending || !content.trim()}
        >
          {isSending ? "Sending..." : "Send message"}
        </button>
      </form>
    </aside>
  );
};
