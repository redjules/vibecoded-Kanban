import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "@/components/AuthGate";

describe("AuthGate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the login form when session restoration is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to your board" }),
    ).toBeVisible();
  });

  it("shows an error for rejected credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: false }),
    );

    render(<AuthGate />);
    await screen.findByRole("heading", { name: "Sign in to your board" });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "user" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the fixed MVP credentials to continue.",
    );
  });

  it("restores a valid session and can log out", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Sign in to your board" }),
      ).toBeVisible(),
    );
    expect(fetchMock).toHaveBeenLastCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  });
});
