import { readFileSync } from "node:fs";

import { type Page, expect, test } from "@playwright/test";

import { DAILY_POOL, dailySeed, decodePool } from "../src/game/pool.ts";

/**
 * Where a deal comes from: the winnable pool, the whole seed space, today's
 * date, or a URL somebody sent you.
 *
 * The pool itself is checked where it can be checked properly —
 * `test/engine/solve.test.ts` re-solves a sample of it, and
 * `test/game/pool.test.ts` pins the daily's arithmetic. What is left for a
 * browser is the wiring: that the file is fetched at all, that the setting
 * picks which space a new deal comes out of, and that the daily everybody gets
 * is the one the arithmetic says it is.
 */

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, hasTouch: true });

/** The committed pool, read the way the generator wrote it. */
function pool(drawCount: 1 | 3): Uint32Array {
  const bytes = readFileSync(
    new URL(`../src/data/winnable-${drawCount}.bin`, import.meta.url),
  );
  return decodePool(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}

/** The deal on the table, read out of the save the island keeps. */
async function seedOf(page: Page): Promise<number> {
  const raw = await page.evaluate(() => localStorage.getItem("sol:v1:game"));
  expect(raw, "no game was saved").not.toBeNull();
  const saved = JSON.parse(raw as string) as { game: string };
  return (JSON.parse(saved.game) as { seed: number }).seed;
}

async function openMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
}

test("the pool is fetched, and the board does not wait for it", async ({
  page,
}) => {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("winnable-")) asked.push(request.url());
  });
  // Slow enough that a board which waited for it would be visibly late.
  await page.route("**/winnable-*.bin", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(52);
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);

  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toContain("winnable-1");
});

test("a new deal comes out of the winnable pool", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  // The first deal of a load can beat the fetch, which is why the pool applies
  // from the next deal onward. The daily button turning on is the pool having
  // landed — there is nothing else in the interface that knows.
  await expect(page.getByRole("button", { name: /Daily deal/ })).toBeEnabled();
  await page.getByRole("button", { name: "New deal" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);

  const seeds = [...pool(1)];
  expect(seeds).toContain(await seedOf(page));
});

test("winnable-only off deals from the whole seed space", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  await page.getByText("Winnable deals only").click();
  await page.getByRole("button", { name: "New deal" }).click();

  // 10,000 pooled deals out of 2³², so a seed from the whole space landing in
  // the pool is a once-in-four-hundred-thousand coincidence.
  const seeds = new Set(pool(1));
  expect(seeds.has(await seedOf(page))).toBe(false);
});

test("the daily is today's deal, and the same one for everybody", async ({
  page,
}) => {
  await page.goto("/");
  await openMenu(page);

  const daily = page.getByRole("button", { name: /Daily deal/ });
  await expect(daily).toBeEnabled();
  await daily.click();

  const expected = dailySeed(pool(1), new Date());
  expect(expected).not.toBeNull();
  expect(await seedOf(page)).toBe(expected);
  // Out of the frozen prefix, so extending the pool cannot move it.
  expect([...pool(1)].indexOf(expected as number)).toBeLessThan(DAILY_POOL);
});

test("the daily waits for the pool rather than dealing something else", async ({
  page,
}) => {
  await page.route("**/winnable-*.bin", (route) => route.abort());
  await page.goto("/");
  await openMenu(page);

  await expect(page.getByRole("button", { name: /Daily deal/ })).toBeDisabled();
  // And the game is perfectly playable without it: a failed pool is a deal
  // from the whole space, not an error.
  await page.getByRole("button", { name: "New deal" }).click();
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
});

test("the result panel shares the deal, not the score", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?deal=24&win");
  await page.locator(".win-veil").tap({ timeout: 10_000 });

  const panel = page.getByRole("dialog", { name: "You won" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Share this deal" }).click();
  await expect(
    panel.getByRole("button", { name: "Link copied" }),
  ).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("deal=24");
  expect(copied).toContain("draw=1");
  // A link to the deal, with nothing about how it went in it.
  expect(copied).not.toContain("time");
  expect(copied).not.toContain("moves");

  // And it opens the deal it names.
  await page.goto(new URL(copied).pathname + new URL(copied).search);
  expect(await seedOf(page)).toBe(24);
});
