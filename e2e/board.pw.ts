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
  sevenOfHearts: 2 * 13 + 6,
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

/**
 * A tap on the *visible strip* of a card in a fan — a few pixels below its own
 * top edge, which is all of it the card above leaves showing. A card's centre
 * in a fanned column belongs to whatever is stacked on it, which is exactly
 * what hit-testing is supposed to say.
 */
async function tapStrip(page: Page, target: Locator) {
  const box = await boxOf(target);
  await page.mouse.move(box.x + box.width / 2, box.y + 6);
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

/**
 * A hint points at a *move*: **the card that can move, and the space it can
 * move into.** Either mark on its own is half a sentence — a card with a ring
 * round it does not say where it is going, and a lit-up column does not say
 * what belongs in it.
 *
 * The destination is a pile rather than a card, which is what lets an empty one
 * be marked at all: an empty column, an empty foundation and a spent stock are
 * exactly the destinations a hint is most useful about, and none of them has a
 * card on it to ring. A ring and a lightened slot, never a colour wash, so it
 * reads the same to somebody who cannot separate the wash from the table —
 * docs/08-accessibility.md.
 */
test("a hint points at the card and at the space it can go", async ({
  page,
}) => {
  const hint = page.getByRole("button", { name: "Hint" });
  const from = page.locator(".card.is-hinting");
  const onto = page.locator(".card.is-hint-target");
  const slot = page.locator(".slot.is-hint");

  // The obvious first move on this deal: the ace of hearts, to a foundation
  // that is still empty. There is no card on the far end, so the slot is what
  // gets marked — the case the old two-cards hint could not express at all.
  await hint.click();
  await expect(from).toHaveCount(1);
  await expect(card(page, CARD.aceOfHearts)).toHaveClass(/is-hinting/);
  await expect(onto).toHaveCount(0);
  await expect(slot).toHaveCount(1);
  await expect(slot).toHaveAttribute("aria-label", /^Foundation, hearts\./);

  // Taking the advice takes the hint off, both halves of it.
  await tapCard(page, card(page, CARD.aceOfHearts));
  await expect(from).toHaveCount(0);
  await expect(slot).toHaveCount(0);

  // The next one is a move between columns, and this time the far end has a
  // card on it: the six of spades onto the seven of hearts.
  await hint.click();
  await expect(from).toHaveCount(1);
  await expect(card(page, CARD.sixOfSpades)).toHaveClass(/is-hinting/);
  await expect(card(page, CARD.sevenOfHearts)).toHaveClass(/is-hint-target/);
  await expect(slot).toHaveCount(0);
});

/**
 * docs/08-accessibility.md: under reduced motion the two pulses become a
 * persistent outline. An animation that is simply switched off would leave a
 * hint that points at nothing, which is the failure mode that doc exists to
 * prevent — the alternative is designed, not absent.
 */
test("a hint under reduced motion is an outline that stays", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await dealt(page);

  await page.getByRole("button", { name: "Hint" }).click();
  const hinted = card(page, CARD.aceOfHearts);
  await expect(hinted).toHaveClass(/is-hinting/);

  // The ring is a pseudo-element over the card, so that is where both the
  // outline and the breathing live — see `.card.is-hinting` in board.css.
  const look = await hinted.locator(".card-flip").evaluate((element) => {
    const ring = getComputedStyle(element, "::after");
    return { animation: ring.animationName, shadow: ring.boxShadow };
  });
  expect(look.animation).toBe("none");
  expect(look.shadow).not.toBe("none");

  // And it is still there a second later, because nothing is animating it away.
  await page.waitForTimeout(1000);
  await expect(hinted).toHaveClass(/is-hinting/);
});

/**
 * A run that has nowhere to go is a run being refused. Shaking the card the
 * finger happened to be on says something different and less true — it says
 * *that card* cannot go there, when what could not go there was the five cards
 * you were holding.
 */
test("a whole run shakes when it is the whole run that is refused", async ({
  page,
}) => {
  // Build a two-card run: the six of spades onto the seven of hearts.
  await dragOnto(
    page,
    card(page, CARD.sixOfSpades),
    card(page, CARD.sevenOfHearts),
  );
  await settled(card(page, CARD.sixOfSpades));

  // It needs a black eight and there is not one on the board, and an empty
  // column is a King's. So the tap is refused — and it is the run that is
  // refused, so it is the run that shakes. The tap goes on the seven's visible
  // strip, because its centre belongs to the six sitting on it.
  await tapStrip(page, card(page, CARD.sevenOfHearts));
  await expect(page.locator(".card.is-shaking")).toHaveCount(2);
  await expect(card(page, CARD.sixOfSpades)).toHaveClass(/is-shaking/);
});

/**
 * A refused drop springs home, and **drops out of the drag band when it lands**.
 * Left there — which is what shipped — the card sits above every pile on the
 * table until some unrelated render happens to rewrite it, and that render can
 * be several moves away. See the z-index note in docs/05-interaction-and-motion.md.
 */
test("a card that springs back stops being the card in front", async ({
  page,
}) => {
  const seven = card(page, CARD.sevenOfHearts);
  const box = await boxOf(seven);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Bare table, well below the board: nothing will take it.
  await page.mouse.move(box.x + 40, box.y + 320, { steps: 12 });
  await expect(seven).toHaveClass(/is-dragging/);
  await page.mouse.up();

  await settled(seven);
  await expect
    .poll(() => seven.evaluate((el) => Number(el.style.zIndex)))
    .toBeLessThan(2000);
});

/**
 * The other half of tap-to-auto-move, and the half that used to shake at you.
 * A card can always be *dragged* back off a foundation when a run needs it; on
 * a phone dragging is the fiddly half of the interface, and a tap that refused
 * a move the rules allow was the game disagreeing with itself.
 */
test("a card already home comes back down when it is tapped", async ({
  page,
}) => {
  // Deal 3's tableau tops are 9♥ A♦ Q♠ 7♥ 3♦ 2♣ 8♣ — an ace to send home, and
  // a black two for it to come back down onto.
  await page.goto("/?deal=3");
  await dealt(page);

  const aceOfDiamonds = 1 * 13 + 0;
  const twoOfClubs = 0 * 13 + 1;
  const ace = card(page, aceOfDiamonds);
  const two = card(page, twoOfClubs);

  const home = await boxOf(page.locator(".slot-foundation").nth(2));
  await tapCard(page, ace);
  const onFoundation = await settled(ace);
  expect(Math.round(onFoundation.x)).toBe(Math.round(home.x));

  // And back down again: the only column that will take it is the two of clubs'.
  await tapCard(page, ace);
  const backDown = await settled(ace);
  const twoBox = await boxOf(two);
  expect(Math.round(backDown.x)).toBe(Math.round(twoBox.x));
  expect(backDown.y).toBeGreaterThan(twoBox.y);
  await expect(page.locator(".card.is-shaking")).toHaveCount(0);
});

test("a new deal starts over", async ({ page }) => {
  await page.locator(".slot-stock").tap();
  await expect(page.locator(".top-bar")).toContainText("1 move");

  // A new deal lives in the menu now: the bottom bar's middle slot is the
  // assist, per the sketch in docs/05-interaction-and-motion.md.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "New deal" }).click();

  await expect(page.locator(".top-bar")).toContainText("0 moves");
  await expect(page.locator(".card")).toHaveCount(52);
  await dealt(page);
  await expect(page.getByRole("button", { name: /undo/i })).toBeDisabled();
});
