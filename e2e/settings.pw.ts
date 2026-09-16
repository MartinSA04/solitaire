import { type Page, expect, test } from "@playwright/test";

/**
 * The settings sheet: every table, deck and back available on first load, and
 * a choice that shows on the board before the sheet has even closed.
 *
 * What is asserted here is the *wiring* — that a choice becomes the one
 * attribute the stylesheets hang off, and that the sheet behaves like a dialog
 * — rather than how any of it looks. How it looks is the visual suite's, and
 * what the colours have to clear is test/themes/.
 */

const DEAL = "/?deal=24";
const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, hasTouch: true });

/**
 * The radio itself is visually hidden — it is still the control, and still
 * what carries the state and the keyboard model, but a pointer meets its
 * label. Which is exactly what a finger does.
 *
 * Named by group as well as by label, because "Minimal" is both a table and a
 * deck: a `<fieldset>` with a `<legend>` is a group with a name, which is one
 * more thing not reimplementing the native control gets for free.
 */
function choose(page: Page, group: string, label: string) {
  return page
    .getByRole("group", { name: group })
    .getByText(label, { exact: true })
    .click();
}

function look(page: Page) {
  return page.evaluate(() => ({ ...document.documentElement.dataset }));
}

async function openSheet(page: Page) {
  await page.goto(DEAL);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

test("a table brings its own deck and back with it", async ({ page }) => {
  await openSheet(page);
  await expect
    .poll(() => look(page))
    .toEqual({
      theme: "warm",
      deck: "minimal",
      back: "lattice",
    });

  // Minimal's back is the flat one: picking that table should not leave the
  // warm table's woven lattice on it. See docs/04-art-direction.md.
  await choose(page, "Table", "Minimal");
  await expect
    .poll(() => look(page))
    .toEqual({
      theme: "minimal",
      deck: "minimal",
      back: "solid",
    });
});

test("a chosen deck survives a change of table", async ({ page }) => {
  await openSheet(page);
  await choose(page, "Cards", "Four colour");
  await choose(page, "Table", "Dark");

  // "Any deck works on any table" — the whole reason a deck and a theme are
  // two attributes rather than one.
  await expect
    .poll(() => look(page))
    .toEqual({
      theme: "dark",
      deck: "four-colour",
      back: "lattice",
    });
});

test("the choice shows on the table, not just in the sheet", async ({
  page,
}) => {
  await openSheet(page);
  // The face, not the card: `--suit` is set on the card and read by the face,
  // which is the element the ink actually lands on.
  const diamond = page.locator('.card[data-suit="1"] .card-face').first();
  const before = await diamond.evaluate((el) => getComputedStyle(el).color);

  await choose(page, "Cards", "Four colour");

  // Four-colour's diamonds are navy. The card layer is not reactive and was
  // never re-rendered; the deck is a custom property the cards already read.
  await expect
    .poll(() => diamond.evaluate((el) => getComputedStyle(el).color))
    .not.toBe(before);
});

test("a deck we did not draw is fetched, once, when it is asked for", async ({
  page,
}) => {
  const sprites: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/decks/")) sprites.push(request.url());
  });

  await openSheet(page);
  // Nothing about a first load touches the sprite: the deck that costs a
  // download is never the one you get without asking.
  expect(sprites).toHaveLength(0);

  await choose(page, "Cards", "French");
  await expect(page.locator(".card-layer.has-art")).toHaveCount(1);
  await expect(page.locator('[data-sprite="french"]')).toHaveCount(1);

  // Every card points into the sprite, and our own corner index stays on top
  // of the art — at a 46px card the deck's own index is about five pixels.
  const art = page.locator('.card[data-card="0"] .card-art use');
  await expect(art).toHaveAttribute("href", "#club_1");
  await expect(page.locator('.card[data-card="0"] .card-index')).toBeVisible();

  // A new deal rebuilds the 52 elements and must point them again — from the
  // copy of the sprite that is already in the document.
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "New deal" }).click();
  await expect(page.locator(".card-layer.has-art")).toHaveCount(1);
  expect(sprites).toHaveLength(1);
});

test("the licences are two taps from the game", async ({ page }) => {
  await openSheet(page);
  await page.getByRole("link", { name: "Credits and licences" }).click();

  await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  // The deck that has an obligation, the decks that do not, and the text.
  await expect(page.getByText("David Bellot")).toBeVisible();
  await expect(page.getByText("Four colour")).toBeVisible();
  const licence = await page.request.get("/decks/french/LICENSE.txt");
  expect(licence.ok()).toBe(true);
  expect(await licence.text()).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
});

test("the clock can be hidden, and the move counter stays", async ({
  page,
}) => {
  await openSheet(page);
  await page.getByText("Show the clock").click();

  await expect(page.locator(".clock")).toHaveText("");
  await expect(page.locator(".moves")).toHaveText("0 moves");
});

test("escape closes it, and it takes the dialog with it", async ({ page }) => {
  await openSheet(page);
  await page.keyboard.press("Escape");

  // The dialog is unmounted rather than left closed in the document: a dozen
  // controls that cannot be reached are still a dozen controls in the
  // accessibility tree.
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});

test("changing the draw mode mid-game asks first", async ({ page }) => {
  await page.goto(DEAL);
  // One move, so there is a game to lose. The stock is a tap away from the
  // top-left of the board.
  const stock = await page.locator(".slot-stock").boundingBox();
  if (stock === null) throw new Error("no stock");
  await page.mouse.click(stock.x + stock.width / 2, stock.y + stock.height / 2);
  await expect(page.locator(".moves")).toHaveText("1 move");

  await page.getByRole("button", { name: "Settings" }).click();
  await choose(page, "Draw", "3 cards");

  // Draw-1 and draw-3 make different games out of the same seed, so this
  // cannot be applied to the game on the table — docs/02-game-spec.md.
  const confirm = page.getByRole("button", { name: "New deal", exact: true });
  await expect(confirm.last()).toBeVisible();
  await expect(page.locator(".moves")).toHaveText("1 move");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".moves")).toHaveText("1 move");
});
