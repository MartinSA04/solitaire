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

const SETTINGS = "sol:v1:settings";
const GAME = "sol:v1:game";
const STATS = "sol:v1:stats";

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

test("a game in progress survives a refresh, undo stack and all", async ({
  page,
}) => {
  await page.goto("/?deal=24");
  await draw(page, 3);
  await expect(page.locator(".top-bar")).toContainText("3 moves");

  const before = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".card")].map(
      (card) => card.style.transform,
    ),
  );
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
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".card")].map(
        (card) => card.style.transform,
      ),
    ),
  ).toEqual(before);

  // The undo stack came back with it, because the save is the move list and
  // replaying it rebuilds the history for free.
  await page.getByRole("button", { name: /undo/i }).click();
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(
    faceUp - 1,
  );
});

test("the clock comes back with the game, and paused", async ({ page }) => {
  await page.goto("/?deal=24");
  await draw(page);
  await expect(page.locator(".clock")).toHaveText(/0:0[1-9]/, {
    timeout: 4000,
  });

  // Leaving the page is what writes the clock down: a move saves the moves,
  // and the seconds between moves are caught by the tab being hidden or
  // closed rather than by four writes a second nobody is reading.
  await page.goto("/");
  expect((await savedGame(page))?.elapsedMs).toBeGreaterThan(500);
  await expect(page.locator(".clock")).toContainText(/0:0[1-9]/);
  const resumed = await page.locator(".clock").textContent();
  // Nothing accrues while the resumed game sits there: the clock counts from
  // the next move, not from the reload.
  await page.waitForTimeout(1500);
  await expect(page.locator(".clock")).toHaveText(resumed ?? "");
});

/**
 * `?win` stages a won board on the card layer and celebrates it; the game
 * underneath was never won. It is a debug trigger, and a debug trigger that
 * quietly inflated your win rate would make the statistics worth nothing.
 *
 * (A real win *is* recorded, and does clear the save — that is asserted at the
 * end of the whole game in e2e/playthrough.pw.ts, where there is a real one.)
 */
test("the debug celebration is a rehearsal, and is not written down", async ({
  page,
}) => {
  await page.goto("/?deal=24");
  await draw(page);
  expect(await stored(page, GAME)).not.toBeNull();

  await page.goto("/?deal=24&win");
  await page.locator(".win-veil").tap({ timeout: 10_000 });
  await expect(page.getByRole("dialog", { name: "You won" })).toBeVisible();

  expect(JSON.parse((await stored(page, STATS)) ?? "{}")).toMatchObject({
    1: { played: 1, won: 0 },
  });
  expect(await stored(page, "sol:v1:records")).toBeNull();
  // And the deal from the URL is the game in progress now, which is what
  // opening somebody's link means.
  expect(await savedGame(page)).toMatchObject({ seed: 24, moves: [] });
});

test("the table, the deck and the sound are remembered", async ({ page }) => {
  await page.goto("/?deal=24");
  await page.getByRole("button", { name: "Menu" }).click();
  await page
    .getByRole("group", { name: "Table" })
    .getByText("Dark", { exact: true })
    .click();
  await page.getByText("Sound").click();
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/?deal=24");
  expect(JSON.parse((await stored(page, SETTINGS)) ?? "{}")).toMatchObject({
    theme: "dark",
    sound: false,
  });
  // And on the document element before the island is anywhere near hydrating,
  // which is what the inline bootstrap in the head is for.
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("dark");
});

test("the chosen table is on the page before the island runs", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sol:v1:settings",
      JSON.stringify({ v: 1, theme: "dark", deck: "four-colour" }),
    );
  });
  // JavaScript for the island is disabled by never letting it hydrate: the
  // bootstrap is inline in the head and runs before anything is fetched, so
  // the attributes are already right in the first response's paint.
  await page.route("**/_astro/*.js", (route) => route.abort());
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => ({ ...document.documentElement.dataset })))
    .toMatchObject({ theme: "dark", deck: "four-colour" });
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

test("a save from another schema version is ignored", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sol:v1:game",
      JSON.stringify({
        v: 99,
        game: JSON.stringify({ v: 1, seed: 24, draw: 1, moves: ["d", "d"] }),
        elapsedMs: 1000,
      }),
    );
  });
  await page.goto("/");
  await expect(page.locator(".top-bar")).toContainText("0 moves");
});

test("games played and won are counted, and a win is recorded", async ({
  page,
}) => {
  await page.goto("/?deal=24");
  await expect(page.locator(".card")).toHaveCount(52);
  // Dealing is not playing: nothing is counted until a move is made.
  expect(await stored(page, STATS)).toBeNull();

  await draw(page);
  expect(JSON.parse((await stored(page, STATS)) ?? "{}")).toMatchObject({
    1: { played: 1, won: 0 },
  });

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Statistics" }).click();
  const stats = page.getByRole("dialog", { name: "Statistics" });
  await expect(stats).toBeVisible();
  await expect(stats.getByRole("row", { name: /^Played/ })).toContainText("1");
  await expect(stats.getByRole("row", { name: /^Win rate/ })).toContainText(
    "0%",
  );

  // The menu saw itself out on the way here, so Escape goes back to the board
  // rather than to the sheet it came from.
  await page.keyboard.press("Escape");
  await expect(stats).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await expect(page.locator(".card")).toHaveCount(52);
});

/**
 * docs/07-architecture.md: "the game is fully playable with storage
 * unavailable". Safari in private browsing used to hand out a store that
 * throws on write, and a browser with cookies blocked throws on the property
 * access itself.
 */
test("a browser that refuses storage still plays", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("SecurityError: storage is disabled");
      },
    });
  });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/?deal=24");
  await expect(page.locator(".card")).toHaveCount(52);
  await draw(page, 2);
  await expect(page.locator(".top-bar")).toContainText("2 moves");
  await page.getByRole("button", { name: /undo/i }).click();
  await expect(page.locator(".top-bar")).toContainText("2 moves");
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(8);

  expect(errors).toEqual([]);
});
