import { type Page, expect, test } from "@playwright/test";

import { type Move, type Suit, deal } from "../src/engine/index.ts";
import { FOUNDATION_ORDER, PILE_ORDER } from "../src/game/Layout.ts";
import { playGreedily } from "../test/engine/helpers.ts";

/**
 * Milestone 6's bar: **a complete game can be won using only a keyboard.**
 *
 * `test/game/keyboard.test.ts` proves the model — that every move of a winning
 * line can be expressed as key presses. This proves the rest of it: that the
 * presses reach the island, that the board takes focus without a pointer ever
 * touching it, and that the game on the screen is the game the model thought
 * it was playing. An audit tool cannot tell you a game is completable; only
 * completing one can.
 *
 * Deal 3 is winnable by the greedy player in `test/engine/helpers.ts`, so the
 * winning line is computed here rather than discovered by the browser. The
 * seed-to-deal mapping is frozen forever (see CLAUDE.md), so this line is a
 * fact about this deal for the life of the project.
 */

const SEED = 3;

const WASTE = 1;
const FOUNDATION = 2;
const TABLEAU = FOUNDATION + FOUNDATION_ORDER.length;

test.use({ viewport: { width: 1280, height: 860 } });

/**
 * The page's own idea of where the focus is, read off the roving tabindex
 * rather than tracked here. Driving the keyboard from a model of the board
 * that the board does not share is how this kind of test passes while the
 * product is broken.
 */
async function focusedPile(page: Page): Promise<number> {
  return page.evaluate(() => {
    const slots = [...document.querySelectorAll(".board .slot")];
    return slots.findIndex((slot) => slot.getAttribute("tabindex") === "0");
  });
}

/** The number of cards the selection currently covers. */
async function selected(page: Page): Promise<number> {
  return page.locator(".card.is-selected").count();
}

async function goto(page: Page, at: number): Promise<void> {
  const count = PILE_ORDER.length;
  for (let guard = 0; guard < count; guard++) {
    const now = await focusedPile(page);
    if (now === at) return;
    const forward = (at - now + count) % count;
    await page.keyboard.press(
      forward * 2 <= count ? "ArrowRight" : "ArrowLeft",
    );
  }
  throw new Error(`the focus would not reach pile ${at}`);
}

/** Open the focused column to exactly `cards`, one arrow press at a time. */
async function reach(page: Page, cards: number): Promise<void> {
  while ((await selected(page)) > cards) await page.keyboard.press("ArrowDown");
  while ((await selected(page)) < cards) {
    const before = await selected(page);
    await page.keyboard.press("ArrowUp");
    if ((await selected(page)) === before)
      throw new Error("the column will not open");
  }
}

function foundationAt(suit: Suit): number {
  return FOUNDATION + FOUNDATION_ORDER.indexOf(suit);
}

async function typeMove(page: Page, move: Move): Promise<void> {
  switch (move.kind) {
    case "draw":
    case "recycle":
      await page.keyboard.press("s");
      return;
    case "wasteToFoundation":
      await goto(page, WASTE);
      await page.keyboard.press("a");
      return;
    case "tableauToFoundation":
      await goto(page, TABLEAU + move.from);
      await reach(page, 1);
      await page.keyboard.press("a");
      return;
    case "wasteToTableau":
      await goto(page, WASTE);
      await page.keyboard.press(" ");
      await goto(page, TABLEAU + move.to);
      await page.keyboard.press(" ");
      return;
    case "foundationToTableau":
      await goto(page, foundationAt(move.suit));
      await page.keyboard.press(" ");
      await goto(page, TABLEAU + move.to);
      await page.keyboard.press(" ");
      return;
    case "tableauToTableau":
      await goto(page, TABLEAU + move.from);
      await reach(page, move.count);
      await page.keyboard.press(" ");
      await goto(page, TABLEAU + move.to);
      await page.keyboard.press(" ");
      return;
  }
}

/**
 * Wait out the deal. Twenty-eight cards leave the stock a row at a time, and
 * for the first two frames of that they are all still *on* the stock — so "no
 * card is moving" is true before the deal has started as well as after it has
 * finished. The seven turned-over column tops are what says it has happened.
 */
async function dealt(page: Page): Promise<void> {
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  await expect(page.locator(".card.is-moving")).toHaveCount(0);
}

test("wins a whole game with nothing but key presses", async ({ page }) => {
  test.slow();
  await page.goto(`/?deal=${SEED}`);
  await dealt(page);

  // Nothing on the board has been focused yet: the first arrow key is what
  // puts the focus on the stock, without a pointer ever being involved.
  expect(await focusedPile(page)).toBe(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".board .slot").nth(WASTE)).toBeFocused();

  for (const move of playGreedily(deal(SEED, 1)).moves) {
    await typeMove(page, move);
  }

  // The win is announced assertively at Stage 0, before a single card has
  // moved — a screen-reader player is not made to wait out the cascade.
  await expect(page.locator("[aria-live='assertive']")).toContainText(
    "You won.",
  );
  // And Stage 0 is already on screen by the time the sentence has been said —
  // "beat", 140ms of it, before a card has moved. See docs/notes.md.
  await expect(page.locator(".game")).toHaveAttribute(
    "data-win",
    /beat|ascend|cascade|clear|card/,
  );
});
