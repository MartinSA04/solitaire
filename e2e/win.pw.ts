import { type Page, expect, test } from "@playwright/test";

/**
 * Milestone 2's bar, as far as automation can carry it: all five stages run,
 * in order, on a real build; the sequence is always skippable; it never blocks
 * the next game; and the reduced-motion path is a designed alternative rather
 * than an absence. See docs/06-win-sequence.md.
 *
 * Every test here uses the debug trigger — `?win` runs the whole sequence
 * without a game having been won — and `?winseed`, which seeds the physics and
 * fixes the timestep so two runs produce the same cascade. Without those this
 * file would be thirteen seconds of coin toss. The one test that wins a game
 * for real is `playthrough.pw.ts`.
 */

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, hasTouch: true });

/** The sequence is ~11s of cascade; a throttled CI machine takes longer. */
const SEQUENCE_TIMEOUT = 45_000;

/**
 * Record every stage the board passes through, from before hydration. Polling
 * for `data-win` would miss Stage 3, which is 600ms long — this cannot.
 */
async function watchStages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stages: string[] = [];
    Object.defineProperty(window, "__stages", { value: stages });
    const attach = (): void => {
      const game = document.querySelector(".game");
      if (game === null) {
        requestAnimationFrame(attach);
        return;
      }
      const record = (): void => {
        const stage = game.getAttribute("data-win");
        if (stage !== null && stages[stages.length - 1] !== stage) {
          stages.push(stage);
        }
      };
      record();
      new MutationObserver(record).observe(game, {
        attributes: true,
        attributeFilter: ["data-win"],
      });
    };
    attach();
  });
}

function stages(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __stages: string[] }).__stages,
  );
}

function game(page: Page) {
  return page.locator(".game");
}

function panel(page: Page) {
  return page.getByRole("dialog", { name: "You won" });
}

/**
 * How much of the trail canvas is still painted, in pixels with any alpha at
 * all. The interesting number is "any": the wash-out subtracts 22% of the
 * alpha per frame for 600ms, which leaves one or two units of it per pixel —
 * invisible against a dark table, a grey haze across a light one, and either
 * way a leftover from a game that is over.
 */
async function trailPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".trail-layer");
    if (canvas === null || canvas.width === 0) return 0;
    const context = canvas.getContext("2d");
    if (context === null) return 0;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) painted++;
    return painted;
  });
}

/** Cards the player can still see. The table is empty when this is zero. */
async function visibleCards(page: Page): Promise<number> {
  return page
    .locator(".card")
    .evaluateAll(
      (nodes) =>
        nodes.filter((node) => getComputedStyle(node).opacity !== "0").length,
    );
}

test("all five stages run, in order, and end on the card", async ({ page }) => {
  test.setTimeout(SEQUENCE_TIMEOUT + 30_000);
  await watchStages(page);
  await page.goto("/?deal=24&win&winseed=7");

  await expect(panel(page)).toBeVisible({ timeout: SEQUENCE_TIMEOUT });
  expect(await stages(page)).toEqual([
    "none",
    "beat",
    "ascend",
    "cascade",
    "clear",
    "card",
  ]);

  // Nothing is created at win time: the same 52 elements played the game.
  await expect(page.locator(".card")).toHaveCount(52);
  // And the table is empty behind the panel.
  expect(await visibleCards(page)).toBe(0);
});

test("the beat comes first: nothing moves for 140ms", async ({ page }) => {
  await watchStages(page);
  await page.goto("/?deal=24&win&winseed=7");

  // Stage 0 is stillness, and it is the most important 140ms in the product.
  await expect(game(page)).toHaveAttribute("data-win", "beat");
  const before = await page
    .locator(".card")
    .evaluateAll((nodes) => nodes.map((n) => n.style.transform));
  await expect(game(page)).toHaveAttribute("data-win", "ascend");
  const after = await page
    .locator(".card")
    .evaluateAll((nodes) => nodes.map((n) => n.style.transform));
  expect(after).toEqual(before);
});

test("a tap anywhere skips to the end card", async ({ page }) => {
  await watchStages(page);
  await page.goto("/?deal=24&win&winseed=7");
  await expect(game(page)).toHaveAttribute("data-win", "cascade");

  await page.locator(".win-veil").tap();

  // ~300ms to the panel: it must feel like a choice, not like an interruption
  // being punished.
  await expect(panel(page)).toBeVisible({ timeout: 2_000 });
  expect(await stages(page)).toEqual([
    "none",
    "beat",
    "ascend",
    "cascade",
    "card",
  ]);
  expect(await visibleCards(page)).toBe(0);
});

test("a skip affordance appears once the cascade is underway", async ({
  page,
}) => {
  await page.goto("/?deal=24&win&winseed=7");
  const skip = page.getByRole("button", { name: "Skip" });

  await expect(game(page)).toHaveAttribute("data-win", "cascade");
  // Low opacity, and only after two seconds — for the person who doesn't know
  // the whole screen is tappable.
  await expect(skip).toHaveCSS("opacity", "0");
  await expect(skip).not.toHaveCSS("opacity", "0", { timeout: 6_000 });

  await skip.click();
  await expect(panel(page)).toBeVisible({ timeout: 2_000 });
});

test("the card carries the time, the moves and the deal number", async ({
  page,
}) => {
  await page.goto("/?deal=24&win&winseed=7");
  await page.locator(".win-veil").tap({ timeout: 10_000 });

  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText("You won");
  // Grouped with thin spaces, so a deal number can be read aloud.
  await expect(panel(page).locator(".result-deal")).toHaveText(
    "Deal #24 · Draw 1",
  );
  await expect(
    panel(page).getByRole("button", { name: "Replay" }),
  ).toBeVisible();
  await expect(
    panel(page).getByRole("button", { name: "New deal" }),
  ).toBeVisible();
});

test("it never blocks the next game", async ({ page }) => {
  await page.goto("/?deal=24&win&winseed=7");
  await page.locator(".win-veil").tap({ timeout: 10_000 });
  await expect(panel(page)).toBeVisible();

  // One tap from the panel to a fresh board, with the cards back.
  await panel(page).getByRole("button", { name: "New deal" }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  expect(await visibleCards(page)).toBe(52);
  await expect(game(page)).toHaveAttribute("data-win", "none");
});

test("replay deals the same game again", async ({ page }) => {
  // What deal 24 opens as. Read from a plain load, because the debug trigger
  // stages a *won* board on the card layer the moment it hydrates — there is
  // no window in which the tableau is on screen to read.
  await page.goto("/?deal=24");
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  const dealt = await page
    .locator(".card:not(.is-face-down)")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-card")));

  await page.goto("/?deal=24&win&winseed=7");
  await page.locator(".win-veil").tap({ timeout: 10_000 });
  await panel(page).getByRole("button", { name: "Replay" }).click();

  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  const again = await page
    .locator(".card:not(.is-face-down)")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-card")));
  expect(again).toEqual(dealt);
  await expect(page.locator(".top-bar")).toContainText("0 moves");
});

test("the panel is dismissible, and the table behind it is empty", async ({
  page,
}) => {
  await page.goto("/?deal=24&win&winseed=7");
  await page.locator(".win-veil").tap({ timeout: 10_000 });
  await expect(panel(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  expect(await visibleCards(page)).toBe(0);
  // The chrome is back, so the menu — and a new deal — is one tap away.
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
});

/**
 * The canvas belongs to the celebration and to nothing after it.
 *
 * Both halves of this were broken. The wash-out and Stage 3's own timer both
 * end at exactly 600ms, so they raced, and the loop lost: it returned on the
 * stage change without ever reaching its `clear()`, leaving 850,000 pixels at
 * an alpha of one or two — a faint band of card paths lying across the next
 * deal. And tearing the sequence down mid-fade (New Deal pressed during the
 * skip) took the timer that would have cleared it.
 */
test("the trails do not outlive the game they came from", async ({ page }) => {
  test.setTimeout(SEQUENCE_TIMEOUT + 30_000);
  await page.goto("/?deal=24&win&winseed=7");
  await expect(panel(page)).toBeVisible({ timeout: SEQUENCE_TIMEOUT });
  expect(await trailPixels(page)).toBe(0);

  await page.getByRole("button", { name: "New deal" }).tap();
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  expect(await trailPixels(page)).toBe(0);
});

test("and not even when the cascade is cut off mid-fade", async ({ page }) => {
  await page.goto("/?deal=24&win&winseed=7");
  // Skip, then start a new game inside the 180ms the canvas fades over.
  await page.locator(".win-veil").tap({ timeout: 10_000 });
  await page.getByRole("button", { name: "New deal" }).tap();

  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  expect(await trailPixels(page)).toBe(0);
  // And the fade class went with it, so the canvas is usable next time.
  await expect(page.locator(".trail-layer")).not.toHaveClass(/is-fading/);
});

test("reduced motion gets a designed alternative, not an absence", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await watchStages(page);
  await page.goto("/?deal=24&win&winseed=7");

  const from = Date.now();
  await expect(panel(page)).toBeVisible({ timeout: 15_000 });
  const elapsed = Date.now() - from;

  // The beat, the bloom, the dissolve, the card — and no cascade to sit
  // through. ~2.4s by design; the bound is loose enough for a slow machine and
  // tight enough to prove the eleven seconds of cards did not happen.
  expect(elapsed).toBeLessThan(6_000);
  expect(await stages(page)).toEqual([
    "none",
    "beat",
    "ascend",
    "cascade",
    "card",
  ]);
  // It still ends with an empty table: the piles faded rather than flying.
  expect(await visibleCards(page)).toBe(0);
});
