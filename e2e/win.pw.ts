import { type Page, expect, test } from "@playwright/test";

/**
 * Milestone 2's bar, as far as automation can carry it: all five stages run,
 * in order, on a real build; the sequence is always skippable; it never blocks
 * the next game; and the reduced-motion path is a designed alternative rather
 * than an absence. See docs/notes.md.
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
