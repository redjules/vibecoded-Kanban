"use client";

import { FormEvent, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

type AuthState = "checking" | "signed-in" | "signed-out";

export const AuthGate = () => {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "include",
        });
        setAuthState(response.ok ? "signed-in" : "signed-out");
      } catch {
        setAuthState("signed-out");
      }
    };

    void restoreSession();
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError("Enter the fixed MVP credentials to continue.");
        return;
      }

      setPassword("");
      setAuthState("signed-in");
    } catch {
      setError("Unable to reach the application. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setAuthState("signed-out");
    setUsername("");
    setPassword("");
  };

  if (authState === "signed-in") {
    return <KanbanBoard onLogout={handleLogout} />;
  }

  if (authState === "checking") {
    return (
      <main className="min-h-screen bg-[var(--surface)]" aria-busy="true" />
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-6 py-12">
      <section className="w-full max-w-md border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary-blue)]">
          Project management
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Sign in to your board
        </h1>
        <form className="mt-8 grid gap-5" onSubmit={handleLogin}>
          <label className="grid gap-2 text-sm font-semibold text-[var(--navy-dark)]">
            Username
            <input
              className="border border-[var(--stroke)] px-3 py-2 text-base font-normal outline-none focus:border-[var(--primary-blue)]"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--navy-dark)]">
            Password
            <input
              className="border border-[var(--stroke)] px-3 py-2 text-base font-normal outline-none focus:border-[var(--primary-blue)]"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
};
