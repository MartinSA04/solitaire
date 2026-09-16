import { type Page, expect, test } from "@playwright/test";

import { type Move, type Suit, DIAMONDS, deal } from "../src/engine/index.ts";
import { FOUNDATION_ORDER } from "../src/game/Layout.ts";
import { PILE_ORDER } from "../src/game/keyboard.ts";
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
  // "beat", 140ms of it, before a card has moved. See docs/06.
  await expect(page.locator(".game")).toHaveAttribute(
    "data-win",
    /beat|ascend|cascade|clear|card/,
  );
});

test("names every pile it lands on", async ({ page }) => {
  await page.goto(`/?deal=${SEED}`);
  await dealt(page);

  const slots = page.locator(".board .slot");
  await expect(slots).toHaveCount(PILE_ORDER.length);

  // The stock is dealt from, so the count is what is left after twenty-eight
  // cards went to the tableau.
  await expect(slots.nth(0)).toHaveAttribute(
    "aria-label",
    "Stock. Twenty-four cards remaining.",
  );
  await expect(slots.nth(1)).toHaveAttribute("aria-label", "Waste. Empty.");
  await expect(slots.nth(FOUNDATION)).toHaveAttribute(
    "aria-label",
    "Foundation, spades. Empty.",
  );
  await expect(slots.nth(TABLEAU)).toHaveAttribute(
    "aria-label",
    /^Tableau column one\. One card\. Top card: /,
  );

  // A move rewrites the labels: they are the board, as far as a screen reader
  // is concerned, and a stale one is a lie about where the cards are.
  await page.keyboard.press("s");
  await expect(slots.nth(0)).toHaveAttribute(
    "aria-label",
    "Stock. Twenty-three cards remaining.",
  );
  await expect(slots.nth(1)).toHaveAttribute(
    "aria-label",
    /^Waste\. Top card: /,
  );
});

test("says what it just did, and never says it into silence", async ({
  page,
}) => {
  await page.goto(`/?deal=${SEED}`);
  await dealt(page);

  const polite = page.locator("[aria-live='polite']");
  await expect(polite).toHaveCount(2);

  await page.keyboard.press("s");
  await expect(polite.filter({ hasText: /^Drew / })).toHaveCount(1);

  // The same sentence twice is the case one live region cannot announce: the
  // second one is not a change. Two regions, written in turn, make it one.
  await goto(page, TABLEAU);
  await page.keyboard.press(" ");
  await goto(page, 0);
  await page.keyboard.press(" ");
  await expect(polite.filter({ hasText: "Not a legal move." })).toHaveCount(1);
  await page.keyboard.press(" ");
  await expect(polite.filter({ hasText: "Not a legal move." })).toHaveCount(1);
  await expect(polite.filter({ hasText: "" }).first()).toBeAttached();
});

/**
 * The touch half of the screen-reader model. On a phone with VoiceOver there
 * are no arrow keys: you swipe to a pile and double-tap it, and the browser
 * dispatches a click straight at the element rather than at a coordinate. That
 * click has to pick up and put down, and the tap a *finger* makes at the same
 * place has to keep going to `Drag` and be played exactly once — which is what
 * the whole of the rest of the suite is quietly checking every time it taps.
 */
test("plays by activation as well as by key, and only once per press", async ({
  page,
}) => {
  await page.goto(`/?deal=${SEED}`);
  await dealt(page);

  const slots = page.locator(".board .slot");
  const activate = (at: number) =>
    slots.nth(at).dispatchEvent("click", { detail: 0 });

  // Deal 3's column two is the ace of diamonds, which has a foundation waiting.
  await activate(TABLEAU + 1);
  await expect(
    page
      .locator("[aria-live='polite']")
      .filter({ hasText: "Picked up ace of diamonds." }),
  ).toHaveCount(1);
  await expect(page.locator(".card.is-held")).toHaveCount(1);

  await activate(foundationAt(DIAMONDS));
  await expect(page.locator(".card.is-held")).toHaveCount(0);
  await expect(page.locator(".top-bar")).toContainText("1 move");

  // And a real tap is the board's, exactly once — not once here and once in
  // `Drag`. Two draws for one press is what a second handler looks like.
  await page.locator(".slot-stock").click();
  await expect(page.locator(".top-bar")).toContainText("2 moves");
});

test("tells somebody the model exists, and asks before ending a game", async ({
  page,
}) => {
  await page.goto(`/?deal=${SEED}`);
  await dealt(page);

  // A keyboard model nobody can find is a keyboard model nobody has.
  await page.keyboard.press("?");
  const overlay = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole("term").first()).toContainText("←");
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();

  // Under five moves a new deal is one press, exactly as it is one tap.
  await page.keyboard.press("s");
  await page.keyboard.press("n");
  await expect(page.locator(".top-bar")).toContainText("0 moves");

  // Past five, the second press is the "yes" — and the question is on screen,
  // in the status line, so it is heard as well as seen.
  for (let i = 0; i < 6; i++) await page.keyboard.press("s");
  await expect(page.locator(".top-bar")).toContainText("6 moves");
  await page.keyboard.press("n");
  await expect(page.locator(".notice")).toContainText("Press N again");
  await expect(page.locator(".top-bar")).toContainText("6 moves");
  await page.keyboard.press("n");
  await expect(page.locator(".top-bar")).toContainText("0 moves");
});

test("keeps Tab out of the card layer", async ({ page }) => {
  await page.goto(`/?deal=${SEED}`);
  await dealt(page);

  // Fifty-two tab stops is not navigation, and neither is thirteen. The board
  // is one composite widget with one way in: exactly one pile is in the tab
  // order at a time, and the arrow keys are what move it.
  const inTabOrder = page.locator('.board .slot[tabindex="0"]');
  await expect(inTabOrder).toHaveCount(1);
  await expect(page.locator('.board .slot[tabindex="-1"]')).toHaveCount(
    PILE_ORDER.length - 1,
  );

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(inTabOrder).toHaveCount(1);
  await expect(page.locator(".board .slot").nth(FOUNDATION)).toBeFocused();

  // And Tab leaves the board rather than walking along it.
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () =>
        document.querySelector(".board")?.contains(document.activeElement) ===
        true,
    ),
  ).toBe(false);
});
