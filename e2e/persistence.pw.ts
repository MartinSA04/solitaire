import { type Page, expect, test } from "@playwright/test";

/**
 * Milestone 5's bar, the half a machine can hold: a game survives a refresh, a
 * corrupted storage key is a new game rather than an error, and a browser that
 * will not give the page any storage at all is still a browser you can play
 * solitaire in.
 *
 * Everything asserted here goes through the real `localStorage` of a real
 * page. The shapes and the hostile inputs are `test/game/persist.test.ts`'s
 * job; what this adds is that the island actually reads and writes them at the
 * moments it should.
 */

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, hasTouch: true });

const GAME = "sol:v1:game";

function stored(page: Page, key: string) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

async function savedGame(page: Page): Promise<{
  seed: number;
  draw: number;
  moves: string[];
  elapsedMs: number;
} | null> {
  const raw = await stored(page, GAME);
  if (raw === null) return null;
  const outer = JSON.parse(raw) as { game: string; elapsedMs: number };
  const inner = JSON.parse(outer.game) as {
    seed: number;
    draw: number;
    moves: string[];
  };
  return { ...inner, elapsedMs: outer.elapsedMs };
}

/** Tap the stock, which is a move in any position. */
async function draw(page: Page, times = 1): Promise<void> {
  for (let at = 0; at < times; at++) await page.locator(".slot-stock").tap();
}

/** Where all fifty-two cards are, which is the whole of what a board looks like. */
function transforms(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".card")].map(
      (card) => card.style.transform,
    ),
  );
}

/** The same, once nothing is moving any more, so it can be compared with. */
async function settled(page: Page): Promise<string[]> {
  let previous: string[] = [];
  await expect
    .poll(async () => {
      const now = await transforms(page);
      const stable = now.join("|") === previous.join("|");
      previous = now;
      return stable;
    })
    .toBe(true);
  return previous;
}

test("a game in progress survives a refresh, undo stack and all", async ({
  page,
}) => {
  await page.goto("/?deal=24");
  await draw(page, 3);
  await expect(page.locator(".top-bar")).toContainText("3 moves");

  const before = await settled(page);
  expect(await savedGame(page)).toMatchObject({
    seed: 24,
    draw: 1,
    moves: ["d", "d", "d"],
  });

  const faceUp = await page.locator(".card:not(.is-face-down)").count();

  // Not `?deal=24` this time: the resume has to be what puts the deal back.
  await page.goto("/");
  await expect(page.locator(".top-bar")).toContainText("3 moves");
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(faceUp);
  expect(await transforms(page)).toEqual(before);

  // The undo stack came back with it, because the save is the move list and
  // replaying it rebuilds the history for free.
  await page.getByRole("button", { name: /undo/i }).click();
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(
    faceUp - 1,
  );
});

test("a corrupt save is a new game, not an error", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sol:v1:game",
      '{"v":1,"game":"{oh no","elapsedMs":9}',
    );
  });
  await page.goto("/");

  await expect(page.locator(".card")).toHaveCount(52);
  await expect(page.locator(".top-bar")).toContainText("0 moves");
  // And the nonsense is replaced by the deal it dealt instead, before a move
  // is made: whatever is on the table is what a reload brings back.
  expect(await savedGame(page)).toMatchObject({ moves: [] });
});
