import { type Locator, type Page, expect, test } from "@playwright/test";

/**
 * Milestone 1's bar: a full game is playable by touch without anything feeling
 * broken. These drive the built site through the same pointer events a finger
 * produces — the board has no clickable elements at all, so there is nothing
 * else to drive it with.
 *
 * Every test opens the same deal. The seed to deal mapping is frozen forever
 * (see CLAUDE.md), so these positions are stable for the life of the project;
 * a random deal would make half of this suite a coin toss.
 */

/** Tableau tops: 7♥ J♠ 5♠ K♦ 7♦ 6♠ A♥. */
const DEAL = "/?deal=24";

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, hasTouch: true });

/** A card by number: suit × 13 + rank, with rank 0 = Ace. See src/engine/card.ts. */
const CARD = {
  sixOfSpades: 3 * 13 + 5,
  sevenOfDiamonds: 1 * 13 + 6,
  aceOfHearts: 2 * 13 + 0,
};

function card(page: Page, id: number): Locator {
  return page.locator(`.card[data-card="${id}"]`);
}

function faceUpCards(page: Page): Locator {
  return page.locator(".card:not(.is-face-down)");
}

async function boxOf(target: Locator) {
  const box = await target.boundingBox();
  if (box === null) throw new Error("element has no box");
  return box;
}

/** Wait until a card has stopped moving, so a measurement is of where it landed. */
async function settled(target: Locator) {
  let previous = "";
  await expect
    .poll(async () => {
      const box = await boxOf(target);
      const now = `${Math.round(box.x)},${Math.round(box.y)}`;
      const stable = now === previous;
      previous = now;
      return stable;
    })
    .toBe(true);
  return boxOf(target);
}

/**
 * A tap on a card. The card layer takes no pointer events — hit-testing is
 * arithmetic against the board, exactly as it is for a finger — so a card is
 * not a click target and has to be pressed by coordinate.
 */
async function tapCard(page: Page, target: Locator) {
  const box = await boxOf(target);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

async function dragOnto(page: Page, from: Locator, to: Locator) {
  const a = await boxOf(from);
  const b = await boxOf(to);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  // Well past the 6px threshold, in steps, so this commits as a drag.
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

/**
 * Wait out the deal. The cards fly from the stock a row at a time, so the
 * seven column tops turn over at the *start* of it — a measurement taken then
 * is of a card still in the air. A card wears a motion class for exactly as
 * long as it is moving, so no card wearing one is the board at rest.
 */
async function dealt(page: Page) {
  await expect(faceUpCards(page)).toHaveCount(7);
  await expect(page.locator(".card.is-moving")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEAL);
  await dealt(page);
});

test("it deals twenty-eight cards to the tableau and twenty-four to the stock", async ({
  page,
}) => {
  await expect(page.locator(".card")).toHaveCount(52);

  const board = await boxOf(page.locator(".board"));
  const rects = await page
    .locator(".card")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().top));
  const inTopRow = rects.filter((top) => top - board.y < 20).length;
  expect(inTopRow).toBe(24);
});

test("the whole board fits on screen, and never scrolls", async ({ page }) => {
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(0);
  expect(overflow.y).toBeLessThanOrEqual(0);

  const board = await boxOf(page.locator(".board"));
  const lowest = await page
    .locator(".card")
    .evaluateAll((nodes) =>
      Math.max(...nodes.map((n) => n.getBoundingClientRect().bottom)),
    );
  expect(lowest).toBeLessThanOrEqual(board.y + board.height + 1);
});

test("tapping the stock turns a card, and the waste grows", async ({
  page,
}) => {
  await page.locator(".slot-stock").tap();
  await expect(faceUpCards(page)).toHaveCount(8);
  await expect(page.locator(".top-bar")).toContainText("1 move");
});

test("the stock recycles once it is spent", async ({ page }) => {
  const stock = page.locator(".slot-stock");
  for (let i = 0; i < 24; i++) await stock.tap();
  await expect(page.locator(".top-bar")).toContainText("24 moves");
  await expect(faceUpCards(page)).toHaveCount(7 + 24);

  await stock.tap();
  await expect(faceUpCards(page)).toHaveCount(7);
  await expect(page.locator(".top-bar")).toContainText("25 moves");
});

test("tapping an Ace sends it home", async ({ page }) => {
  const ace = card(page, CARD.aceOfHearts);
  // The foundations run ♠ ♥ ♦ ♣ left to right, so hearts is the second slot.
  const hearts = await boxOf(page.locator(".slot-foundation").nth(1));

  await tapCard(page, ace);

  await expect(page.locator(".top-bar")).toContainText("1 move");
  const landed = await settled(ace);
  expect(Math.round(landed.x)).toBe(Math.round(hearts.x));
  expect(Math.round(landed.y)).toBe(Math.round(hearts.y));
  // Seven column tops plus the Ace now sitting face up on its foundation.
  await expect(faceUpCards(page)).toHaveCount(8);
});

test("a card can be dragged onto a legal target", async ({ page }) => {
  const six = card(page, CARD.sixOfSpades);
  const seven = card(page, CARD.sevenOfDiamonds);
  const target = await boxOf(seven);

  await dragOnto(page, six, seven);

  await expect(page.locator(".top-bar")).toContainText("1 move");
  const landed = await settled(six);
  // It sits on the card it was dropped on, one face-up fan offset below.
  expect(Math.abs(landed.x - target.x)).toBeLessThan(1);
  expect(landed.y - target.y).toBeGreaterThan(landed.height * 0.2);
  expect(landed.y - target.y).toBeLessThan(landed.height * 0.4);
  // The column it left is down to face-down cards, so one turned over.
  await expect(faceUpCards(page)).toHaveCount(8);
});

test("an illegal drop springs back where it came from", async ({ page }) => {
  const six = card(page, CARD.sixOfSpades);
  const before = await boxOf(six);
  const board = await boxOf(page.locator(".board"));

  // The gap column between the waste and the foundations is not a pile.
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(board.x + board.width / 2, board.y + 4, { steps: 12 });
  await page.mouse.up();

  const after = await settled(six);
  expect(Math.round(after.x)).toBe(Math.round(before.x));
  expect(Math.round(after.y)).toBe(Math.round(before.y));
  await expect(page.locator(".top-bar")).toContainText("0 moves");
});

test("undo puts the board back, and is disabled at the deal", async ({
  page,
}) => {
  const undo = page.getByRole("button", { name: /undo/i });
  await expect(undo).toBeDisabled();

  const six = card(page, CARD.sixOfSpades);
  const before = await boxOf(six);
  await dragOnto(page, six, card(page, CARD.sevenOfDiamonds));
  await expect(page.locator(".top-bar")).toContainText("1 move");
  await expect(undo).toBeEnabled();

  await undo.click();
  const after = await settled(six);
  expect(Math.round(after.x)).toBe(Math.round(before.x));
  expect(Math.round(after.y)).toBe(Math.round(before.y));
  await expect(undo).toBeDisabled();
  // Undo is forgiveness, not a way to cheat the counter down.
  await expect(page.locator(".top-bar")).toContainText("1 move");
});

test("a long press opens a column, and letting go closes it", async ({
  page,
}) => {
  // The Ace of hearts is the top of the rightmost column, six face-down cards
  // deep. A *tap* on it sends it home — the test above — so this is also the
  // check that a long press is a gesture of its own and not a slow tap.
  const ace = card(page, CARD.aceOfHearts);
  const before = await boxOf(ace);

  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  await page.mouse.down();
  // Past the 350ms threshold, plus the length of the fan opening.
  await page.waitForTimeout(700);

  const open = await boxOf(ace);
  // Six face-down cards at the face-up fan instead of the face-down one: the
  // buried run opens out far enough to count.
  expect(open.y - before.y).toBeGreaterThan(open.height * 0.5);
  expect(Math.round(open.x)).toBe(Math.round(before.x));

  await page.mouse.up();
  const shut = await settled(ace);
  expect(Math.round(shut.y)).toBe(Math.round(before.y));
  await expect(page.locator(".top-bar")).toContainText("0 moves");
});

test("the clock starts at the first move, not at the deal", async ({
  page,
}) => {
  const clock = page.locator(".clock");
  await expect(clock).toHaveText("0:00");
  // A game left open in a tab while you make coffee does not start at four
  // minutes — see docs/02-game-spec.md.
  await page.waitForTimeout(1_400);
  await expect(clock).toHaveText("0:00");

  await page.locator(".slot-stock").tap();
  await expect(clock).not.toHaveText("0:00", { timeout: 3_000 });
});

test("the same deal number deals the same game", async ({ page }) => {
  const first = await page
    .locator(".card:not(.is-face-down)")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-card")));

  await page.goto(DEAL);
  await dealt(page);
  const second = await page
    .locator(".card:not(.is-face-down)")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-card")));

  expect(second).toEqual(first);
});

test("a new deal starts over", async ({ page }) => {
  await page.locator(".slot-stock").tap();
  await expect(page.locator(".top-bar")).toContainText("1 move");

  await page.getByRole("button", { name: "New deal" }).click();

  await expect(page.locator(".top-bar")).toContainText("0 moves");
  await expect(page.locator(".card")).toHaveCount(52);
  await dealt(page);
  await expect(page.getByRole("button", { name: /undo/i })).toBeDisabled();
});
