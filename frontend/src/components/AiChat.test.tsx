import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiChat } from "@/components/AiChat";
import { initialData } from "@/lib/kanban";

const response = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
});

describe("AiChat", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("displays a reply without replacing the board", async () => {
    const onBoardUpdate = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(
        response({
          messages: [
            { id: "1", role: "user", content: "What should I do?" },
            { id: "2", role: "assistant", content: "Start with discovery." },
          ],
          board: initialData,
          operationsApplied: 0,
        }),
      );

    render(<AiChat onBoardUpdate={onBoardUpdate} />);
    await screen.findByText("What would you like to change on the board?");
    await userEvent.type(
      screen.getByLabelText("Message the project assistant"),
      "What should I do?",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Start with discovery.")).toBeVisible();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/ai/messages",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onBoardUpdate).not.toHaveBeenCalled();
  });

  it("replaces the board after accepted AI operations", async () => {
    const onBoardUpdate = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(
        response({
          messages: [{ id: "1", role: "assistant", content: "Created it." }],
          board: initialData,
          operationsApplied: 1,
        }),
      );

    render(<AiChat onBoardUpdate={onBoardUpdate} />);
    await screen.findByText("What would you like to change on the board?");
    await userEvent.type(
      screen.getByLabelText("Message the project assistant"),
      "Create a card",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Created it.")).toBeVisible();
    expect(onBoardUpdate).toHaveBeenCalledWith(initialData);
  });

  it("keeps the message available for retry after a provider error", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(
        response({ detail: "AI is not configured on this server." }, false),
      )
      .mockResolvedValueOnce(
        response({
          messages: [
            { id: "1", role: "assistant", content: "Retried successfully." },
          ],
          board: initialData,
          operationsApplied: 0,
        }),
      );

    render(<AiChat onBoardUpdate={vi.fn()} />);
    await screen.findByText("What would you like to change on the board?");
    const input = screen.getByLabelText("Message the project assistant");
    await userEvent.type(input, "Try again");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI is not configured on this server.",
    );
    expect(input).toHaveValue("Try again");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Retried successfully.")).toBeVisible();
  });
});
