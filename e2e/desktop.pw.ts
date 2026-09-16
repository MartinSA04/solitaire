import { type Page, expect, test } from "@playwright/test";

/**
 * What a desktop adds, from docs/05-interaction-and-motion.md: the controls
 * move into the top bar because there is no thumb zone, a card under the
 * cursor lifts, and the piles that would take what you are carrying say so.
 *
 * The same file's landscape phone is here too, because it is the same layout:
 * the scarce dimension in landscape is height, and two bars cost a hundred
 * pixels of table for no reason.
 */

const DEAL = "/?deal=24";

/** Column seven of deal 24 is the ace of hearts on six face-down cards. */
const CARD = {
  aceOfHearts: 2 * 13 + 0,
  sevenOfHearts: 2 * 13 + 6,
  sixOfSpades: 3 * 13 + 5,
};

const DESKTOP = { width: 1280, height: 860 };
const PHONE = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function dealt(page: Page): Promise<void> {
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  await expect(page.locator(".card.is-moving")).toHaveCount(0);
}

async function boxOf(page: Page, card: number) {
  const box = await page.locator(`.card[data-card="${card}"]`).boundingBox();
  if (box === null) throw new Error(`card ${card} has no box`);
  return box;
}

async function centreOf(page: Page, card: number) {
  const box = await boxOf(page, card);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A point on the *visible strip* of a card in a fan — a few pixels below its
 * own top edge, which is all of it the card above leaves showing. A card's
 * centre in a fanned column belongs to whatever is stacked on it, which is
 * exactly what hit-testing is supposed to say.
 */
async function stripOf(page: Page, card: number) {
  const box = await boxOf(page, card);
  return { x: box.x + box.width / 2, y: box.y + 8 };
}

/** Is the bar drawn over the top bar's row rather than at the foot of the page? */
async function controlsAreOnTop(page: Page): Promise<boolean> {
  const bar = await page.locator(".bottom-bar").boundingBox();
  const board = await page.locator(".board").boundingBox();
  if (bar === null || board === null) throw new Error("no chrome");
  return bar.y + bar.height <= board.y + 1;
}

test.describe("one bar, where there is no thumb zone", () => {
  test("the controls sit in the top bar on a desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(DEAL);
    await dealt(page);

    expect(await controlsAreOnTop(page)).toBe(true);
    // One set of controls, not two. Two would be two in the accessibility tree
    // and the wrong one would rot.
    await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(1);
    await expect(page.locator(".bottom-bar .control")).toHaveCount(3);
  });

  test("and on a phone turned sideways, where the scarce thing is height", async ({
    page,
  }) => {
    await page.setViewportSize(LANDSCAPE);
    await page.goto(DEAL);
    await dealt(page);

    expect(await controlsAreOnTop(page)).toBe(true);

    // The point of the exercise: the board gets the hundred pixels back, and
    // the cards are bigger than they would be under two bars.
    const board = await page.locator(".board").boundingBox();
    expect(board?.height).toBeGreaterThan(LANDSCAPE.height - 70);
  });

  test("but stays under the thumb on a phone held upright", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(DEAL);
    await dealt(page);

    expect(await controlsAreOnTop(page)).toBe(false);
    const bar = await page.locator(".bottom-bar").boundingBox();
    expect(bar?.y).toBeGreaterThan(PHONE.height - 100);
  });
});

test.describe("what the cursor is over", () => {
  test.use({ viewport: DESKTOP });

  test("lifts the cards a click would move, and nothing else", async ({
    page,
  }) => {
    await page.goto(DEAL);
    await dealt(page);

    const hovered = page.locator(".card.is-hovered");
    await expect(hovered).toHaveCount(0);

    const ace = await centreOf(page, CARD.aceOfHearts);
    await page.mouse.move(ace.x, ace.y);
    await expect(hovered).toHaveCount(1);
    await expect(
      page.locator(`.card[data-card="${CARD.aceOfHearts}"]`),
    ).toHaveClass(/is-hovered/);

    // A face-down card is not yours to move, so nothing lifts for it. Column
    // seven's six buried cards are the strips above the ace.
    const aceBox = await boxOf(page, CARD.aceOfHearts);
    await page.mouse.move(ace.x, aceBox.y - 10);
    await expect(hovered).toHaveCount(0);

    // Off the table entirely.
    await page.mouse.move(ace.x, 840);
    await expect(hovered).toHaveCount(0);
  });

  test("lifts a whole run, because that is what a click takes", async ({
    page,
  }) => {
    await page.goto(DEAL);
    await dealt(page);

    // Build a run: the six of spades onto the seven of hearts.
    await page.keyboard.press("ArrowRight");
    const six = await centreOf(page, CARD.sixOfSpades);
    await page.mouse.move(six.x, six.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator(".card.is-moving")).toHaveCount(0);

    await expect(
      page.locator(`.card[data-card="${CARD.sixOfSpades}"]`),
    ).toBeVisible();

    // Hovering the strip of the card the run is built on lifts both of them:
    // a click there would take the pair.
    const seven = await stripOf(page, CARD.sevenOfHearts);
    await page.mouse.move(seven.x, seven.y);
    await expect(page.locator(".card.is-hovered")).toHaveCount(2);
  });
});

test.describe("where what you are carrying can go", () => {
  test.use({ viewport: DESKTOP });

  test("a drag lights the piles that would take it, and only those", async ({
    page,
  }) => {
    await page.goto(DEAL);
    await dealt(page);
    await expect(page.locator(".slot.is-legal")).toHaveCount(0);

    const ace = await centreOf(page, CARD.aceOfHearts);
    await page.mouse.move(ace.x, ace.y);
    await page.mouse.down();
    await page.mouse.move(ace.x + 40, ace.y - 120, { steps: 10 });

    // An ace has exactly one home and nowhere else to be: its own foundation.
    await expect(page.locator(".slot.is-legal")).toHaveCount(1);
    await expect(page.locator(".slot-foundation.is-legal")).toHaveCount(1);

    await page.mouse.up();
    await expect(page.locator(".slot.is-legal")).toHaveCount(0);
  });

  test("and so does the space bar, because it is the same hand", async ({
    page,
  }) => {
    await page.goto(DEAL);
    await dealt(page);

    // Walk the focus to column seven and pick the ace up.
    for (let step = 0; step < 12; step++)
      await page.keyboard.press("ArrowRight");
    await page.keyboard.press(" ");
    await expect(page.locator(".card.is-held")).toHaveCount(1);
    await expect(page.locator(".slot.is-legal")).toHaveCount(1);

    // Escape puts it back, and the board goes quiet again.
    await page.keyboard.press("Escape");
    await expect(page.locator(".slot.is-legal")).toHaveCount(0);
  });
});
