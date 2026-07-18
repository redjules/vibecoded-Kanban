import { expect, test } from "@playwright/test";
import { type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" }),
  ).toBeVisible();
};

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByText("Enter the fixed MVP credentials to continue."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" }),
  ).not.toBeVisible();
});

test("restores a session after reload and logs out", async ({ page }) => {
  await signIn(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();

  await expect(
    page.getByRole("heading", { name: "Sign in to your board" }),
  ).toBeVisible();
});

test.describe("authenticated board", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the kanban board", async ({ page }) => {
    await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  });

  test("adds a card to a column", async ({ page }) => {
    const title = `Playwright card ${Date.now()}`;
    const firstColumn = page.locator('[data-testid^="column-"]').first();
    await firstColumn.getByRole("button", { name: /add a card/i }).click();
    await firstColumn.getByPlaceholder("Card title").fill(title);
    await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
    await firstColumn.getByRole("button", { name: /add card/i }).click();
    await expect(firstColumn.getByText(title)).toBeVisible();
    await page.reload();
    await expect(firstColumn.getByText(title)).toBeVisible();

    await firstColumn
      .locator(`button[aria-label="Delete ${title}"]`)
      .click();
    await expect(firstColumn.getByText(title)).not.toBeVisible();
  });

  test("moves a card between columns", async ({ page }) => {
    const sourceColumn = page.locator('[data-testid^="column-"]').first();
    const card = sourceColumn.locator('[data-testid^="card-"]').first();
    const targetColumn = page.locator('[data-testid^="column-"]').nth(3);
    const cardId = await card.getAttribute("data-testid");
    const cardBox = await card.boundingBox();
    const columnBox = await targetColumn.boundingBox();
    if (!cardBox || !columnBox) {
      throw new Error("Unable to resolve drag coordinates.");
    }

    await page.mouse.move(
      cardBox.x + cardBox.width / 2,
      cardBox.y + cardBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      columnBox.x + columnBox.width / 2,
      columnBox.y + 320,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect(targetColumn.getByTestId(cardId!)).toBeVisible();
    await page.reload();
    await expect(targetColumn.getByTestId(cardId!)).toBeVisible();
    const response = await page.context().request.post(`/api/cards/${cardId!.replace("card-", "")}/move`, {
      data: { column_id: 1, position: 0 },
    });
    expect(response.ok()).toBeTruthy();
  });

  test("shows a reply-only AI conversation", async ({ page }) => {
    await page.route("**/api/ai/messages", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            { id: "1", role: "user", content: "What should I prioritize?" },
            { id: "2", role: "assistant", content: "Start with customer signals." },
          ],
          board: {},
          operationsApplied: 0,
        }),
      });
    });

    await page.getByLabel("Message the project assistant").fill("What should I prioritize?");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Start with customer signals.")).toBeVisible();
  });

  test("updates the board from an AI operation response", async ({ page }) => {
    const boardResponse = await page.context().request.get("/api/board");
    expect(boardResponse.ok()).toBeTruthy();
    const board = await boardResponse.json();
    const cardId = "ai-created-card";
    board.cards[cardId] = {
      id: cardId,
      title: "AI-created card",
      details: "Returned by the mocked AI response.",
    };
    board.columns[0].cardIds.push(cardId);

    await page.route("**/api/ai/messages", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            { id: "1", role: "user", content: "Create a card" },
            { id: "2", role: "assistant", content: "I created the card." },
          ],
          board,
          operationsApplied: 1,
        }),
      });
    });

    await page.getByLabel("Message the project assistant").fill("Create a card");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("AI-created card")).toBeVisible();
  });
});
