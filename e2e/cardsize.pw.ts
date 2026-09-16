import { type Page, expect, test } from "@playwright/test";

import { TABLEAU_COLUMNS } from "../src/engine/index.ts";

/**
 * The Large card size from docs/08-accessibility.md, wired up.
 *
 * `test/game/layout.test.ts` pins the arithmetic — how big the cards get, how
 * many columns are on screen, where the pages start and stop. This is the rest
 * of it: that the setting reaches the board, that the tableau pages and the
 * top row does not, that the keyboard drags the page along behind the focus,
 * and that the game is still playable by tap with two thirds of it on screen.
 */

const DEAL = "/?deal=24";
const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE });

async function dealt(page: Page): Promise<void> {
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  await expect(page.locator(".card.is-moving")).toHaveCount(0);
}

/** Open on a board that has already been asked for Large cards. */
async function large(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sol:v1:settings",
      JSON.stringify({ v: 1, cardSize: "large" }),
    );
  });
  await page.goto(DEAL);
  await dealt(page);
}

async function cardWidth(page: Page): Promise<number> {
  const box = await page.locator(".card").first().boundingBox();
  if (box === null) throw new Error("no card");
  return box.width;
}

/** The left edge of a tableau slot, which is where its column is on screen. */
async function columnX(page: Page, column: number): Promise<number> {
  const box = await page.locator(".slot-column").nth(column).boundingBox();
  if (box === null) throw new Error(`column ${column} has no box`);
  return box.x;
}

async function onScreen(page: Page, column: number): Promise<boolean> {
  const x = await columnX(page, column);
  const width = await cardWidth(page);
  return x >= -1 && x + width <= PHONE.width + 1;
}

test("makes the cards bigger, and shows fewer of them", async ({ page }) => {
  await page.goto(DEAL);
  await dealt(page);
  const comfortable = await cardWidth(page);
  for (let column = 0; column < TABLEAU_COLUMNS; column++) {
    expect(await onScreen(page, column), `column ${column}`).toBe(true);
  }
  await expect(page.locator(".pager")).toHaveCount(0);

  await large(page);
  expect(await cardWidth(page)).toBeGreaterThan(comfortable * 1.3);
  await expect(page.locator(".pager")).toBeVisible();

  // Five of the seven, and the last two are off the side until you page.
  expect(await onScreen(page, 4)).toBe(true);
  expect(await onScreen(page, 6)).toBe(false);
});

test("pages the tableau and leaves the top row alone", async ({ page }) => {
  await large(page);

  const stock = await page.locator(".slot-stock").boundingBox();
  const clubs = await page.locator(".slot-foundation").nth(3).boundingBox();
  const first = await columnX(page, 0);

  await page.getByRole("button", { name: "Columns to the right" }).click();
  await expect(page.locator(".pager-dot.is-here")).toHaveCount(1);

  // Column seven has arrived and column one has gone.
  await expect.poll(() => onScreen(page, 6), { timeout: 3000 }).toBe(true);
  expect(await onScreen(page, 0)).toBe(false);
  expect(await columnX(page, 0)).toBeLessThan(first);

  // The stock, the waste and every foundation are exactly where they were:
  // they are where every move ends up, and a board whose fixed points slide
  // away has none.
  expect(await page.locator(".slot-stock").boundingBox()).toEqual(stock);
  expect(await page.locator(".slot-foundation").nth(3).boundingBox()).toEqual(
    clubs,
  );

  // And back.
  await page.getByRole("button", { name: "Columns to the left" }).click();
  await expect.poll(() => onScreen(page, 0), { timeout: 3000 }).toBe(true);
});

test("all six piles of the top row stay on screen", async ({ page }) => {
  await large(page);

  // The half docs/08 did not foresee: a card too big for seven columns is too
  // big for the six piles above them, so they wrap rather than falling off.
  for (const slot of [".slot-stock", ".slot-waste"]) {
    const box = await page.locator(slot).boundingBox();
    expect(box, slot).not.toBeNull();
    expect(box!.x, slot).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width, slot).toBeLessThanOrEqual(PHONE.width + 1);
  }

  const foundations = page.locator(".slot-foundation");
  await expect(foundations).toHaveCount(4);
  for (let index = 0; index < 4; index++) {
    const box = await foundations.nth(index).boundingBox();
    expect(box!.x + box!.width, `foundation ${index}`).toBeLessThanOrEqual(
      PHONE.width + 1,
    );
    // On the second row, under the stock rather than beside it.
    expect(box!.y, `foundation ${index}`).toBeGreaterThan(
      (await page.locator(".slot-stock").boundingBox())!.y,
    );
  }
});

test("the keyboard drags the page along behind the focus", async ({ page }) => {
  await large(page);

  // Walk right to column seven. The focus is the only idea a keyboard or a
  // screen reader has of where it is, so it cannot be left off the board.
  for (let step = 0; step < 12; step++) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".slot-column").nth(6)).toBeFocused();
  await expect.poll(() => onScreen(page, 6), { timeout: 3000 }).toBe(true);

  // And back again, which brings the page with it.
  for (let step = 0; step < 6; step++) await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".slot-column").nth(0)).toBeFocused();
  await expect.poll(() => onScreen(page, 0), { timeout: 3000 }).toBe(true);
});

test("is still an ordinary game of solitaire", async ({ page }) => {
  await large(page);

  // Column seven of deal 24 is the ace of hearts; it is on the second page,
  // and tapping it still sends it home — tap-to-auto-move is why paging costs
  // nothing, since no move ever needs a drag across a page boundary.
  await page.getByRole("button", { name: "Columns to the right" }).click();
  await expect.poll(() => onScreen(page, 6), { timeout: 3000 }).toBe(true);

  const ace = page.locator('.card[data-card="26"]');
  const box = await ace.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.locator(".top-bar")).toContainText("1 move");
  await expect(page.locator(".slot-foundation").nth(1)).toHaveAttribute(
    "aria-label",
    "Foundation, hearts. Up to the ace.",
  );
});

test("goes back to one page when the cards do", async ({ page }) => {
  await large(page);
  await expect(page.locator(".pager")).toBeVisible();
  await page.getByRole("button", { name: "Columns to the right" }).click();
  await expect.poll(() => onScreen(page, 6), { timeout: 3000 }).toBe(true);

  await page.getByRole("button", { name: "Menu" }).click();
  await page
    .getByRole("group", { name: "Card size" })
    .getByText("Comfortable", { exact: true })
    .click();
  await page.getByRole("button", { name: "Done" }).click();

  // Every column back on screen, and nothing left to page through — including
  // the page that was showing, which had no business surviving. Polled,
  // because the row slides back rather than jumping.
  await expect(page.locator(".pager")).toHaveCount(0);
  for (let column = 0; column < TABLEAU_COLUMNS; column++) {
    await expect
      .poll(() => onScreen(page, column), { timeout: 3000 })
      .toBe(true);
  }
});

test("wins from a paged board exactly as from any other", async ({ page }) => {
  // The one thing paging cannot touch: by the time a game is won the tableau
  // is empty, every card is on a foundation and the foundations never moved.
  // The cascade falls through a board with no pages left in it.
  await page.addInitScript(() => {
    localStorage.setItem(
      "sol:v1:settings",
      JSON.stringify({ v: 1, cardSize: "large" }),
    );
  });
  await page.goto("/?deal=24&win&winseed=3");

  await expect(page.locator(".game")).toHaveAttribute("data-win", "cascade", {
    timeout: 20_000,
  });
  await page.locator(".win-veil").click();
  await expect(page.getByRole("dialog", { name: "You won" })).toBeVisible();
});
