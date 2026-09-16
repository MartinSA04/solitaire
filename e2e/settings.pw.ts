import { type Page, expect, test } from "@playwright/test";

/**
 * The menu sheet: the deals you can start, every table and deck available on
 * first load, and a choice that shows on the board before the sheet has even
 * closed.
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
  await openMenu(page);
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
}

/**
 * The deck is chosen in its own sheet now — twenty-one of them with pictures
 * is not a row of chips — so picking one is: open the gallery from the menu,
 * click the tile, close the gallery.
 *
 * By id, on the label wrapping the radio: the radio is visually hidden and a
 * pointer meets its label, and the accessible name of a tile is its name *and*
 * its description *and* its size, which is right for a screen reader and
 * useless as a selector.
 */
async function chooseDeck(page: Page, id: string) {
  await page.getByRole("button", { name: /^Deck/ }).click();
  const decks = page.getByRole("dialog", { name: "Decks" });
  await expect(decks).toBeVisible();
  await decks.locator(`label:has(input[value="${id}"])`).click();
  await decks.getByRole("button", { name: "Done" }).click();
  await expect(decks).toHaveCount(0);
}

test("a table brings its own deck with it, and the deck brings its back", async ({
  page,
}) => {
  await openSheet(page);
  await expect
    .poll(() => look(page))
    .toEqual({
      theme: "warm",
      deck: "minimal",
      back: "lattice",
    });

  // A table changes the deck's *colours*, not which deck it is, so the back
  // does not move either. See docs/04-art-direction.md.
  await choose(page, "Table", "Minimal");
  await expect
    .poll(() => look(page))
    .toEqual({
      theme: "minimal",
      deck: "minimal",
      back: "lattice",
    });
});

test("there is no way to choose a back, because a deck comes with one", async ({
  page,
}) => {
  await openSheet(page);
  await expect(page.getByRole("group", { name: "Card back" })).toHaveCount(0);

  // Each of the decks we draw gets its own, and no two the same: face-down is
  // how a deck is recognised, twenty-eight cards are face-down at deal time,
  // and for these decks that pattern is the only back there is. A deck we did
  // not draw is printed on the back out of its own sprite, so it is not held
  // to this — see e2e/decks.pw.ts.
  const backs: string[] = [];
  for (const deck of ["classic", "vintage", "high-contrast", "four-colour"]) {
    await chooseDeck(page, deck);
    await expect.poll(async () => (await look(page)).back).not.toBe("lattice");
    backs.push((await look(page)).back as string);
    await openMenu(page);
  }
  expect(new Set(backs).size).toBe(backs.length);
});

test("a chosen deck survives a change of table", async ({ page }) => {
  await openSheet(page);
  await chooseDeck(page, "four-colour");
  await openMenu(page);
  await choose(page, "Table", "Dark");

  // "Any deck works on any table" — the whole reason a deck and a theme are
  // two attributes rather than one.
  await expect
    .poll(() => look(page))
    .toEqual({
      theme: "dark",
      deck: "four-colour",
      back: "dots",
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

  await chooseDeck(page, "four-colour");

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

  await chooseDeck(page, "french");
  await expect(page.locator(".card-layer.has-art")).toHaveCount(1);
  await expect(page.locator('[data-sprite="french"]')).toHaveCount(1);

  // Every card points into the sprite, and nothing of ours is drawn on top of
  // it: a sourced deck is somebody's artwork and is shown as it was drawn. The
  // large index over it is a setting now — see e2e/decks.pw.ts.
  const art = page.locator('.card[data-card="0"] .card-art use');
  await expect(art).toHaveAttribute("href", "#club_1");
  await expect(
    page.locator('.card[data-card="0"] .card-index'),
  ).not.toBeVisible();

  // A new deal rebuilds the 52 elements and must point them again — from the
  // copy of the sprite that is already in the document. The preview in the
  // gallery is a second request for this deck's directory, so only the sprite
  // itself is counted.
  await openMenu(page);
  await page.getByRole("button", { name: "New deal" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await expect(page.locator(".card-layer.has-art")).toHaveCount(1);
  expect(sprites.filter((url) => url.endsWith("deck.svg"))).toHaveLength(1);
});

test("the licences are two taps from the game", async ({ page }) => {
  await openSheet(page);
  await page.getByRole("link", { name: "Credits and licences" }).click();

  await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  // The decks that have an obligation, the decks that do not, and the text.
  // `first()` because David Bellot drew two of the decks here — the page is
  // generated from the registry, so a name appears as often as it is owed.
  await expect(page.getByText("David Bellot").first()).toBeVisible();
  await expect(page.getByText("Vincent Bermel").first()).toBeVisible();
  await expect(
    page.getByRole("term").filter({ hasText: /^Four colour$/ }),
  ).toBeVisible();
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
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
});

test("changing the draw mode mid-game asks first", async ({ page }) => {
  await page.goto(DEAL);
  // One move, so there is a game to lose. The stock is a tap away from the
  // top-left of the board.
  const stock = await page.locator(".slot-stock").boundingBox();
  if (stock === null) throw new Error("no stock");
  await page.mouse.click(stock.x + stock.width / 2, stock.y + stock.height / 2);
  await expect(page.locator(".moves")).toHaveText("1 move");

  await openMenu(page);
  await choose(page, "Draw", "3 cards");

  // Draw-1 and draw-3 make different games out of the same seed, so this
  // cannot be applied to the game on the table — docs/02-game-spec.md.
  const confirm = page
    .getByRole("group", { name: "Draw" })
    .getByRole("button", { name: "New deal" });
  await expect(confirm).toBeVisible();
  await expect(page.locator(".moves")).toHaveText("1 move");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".moves")).toHaveText("1 move");
});

/**
 * docs/02-game-spec.md: a new deal is one tap under about five moves and asks
 * first over it. The asking is a modal in direct response to a press, which is
 * the only kind docs/01 allows — and it is the difference between a stray tap
 * costing nothing and it costing the game you were in the middle of.
 */
test("a new deal mid-game asks before it throws the game away", async ({
  page,
}) => {
  await page.goto(DEAL);
  const stock = page.locator(".slot-stock");
  for (let at = 0; at < 6; at++) await stock.tap();
  await expect(page.locator(".moves")).toHaveText("6 moves");

  await openMenu(page);
  await page.getByRole("button", { name: "New deal" }).first().click();
  await expect(page.getByText("6 moves in.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".moves")).toHaveText("6 moves");

  await openMenu(page);
  await page.getByRole("button", { name: "New deal" }).first().click();
  await page.getByRole("button", { name: "New deal" }).last().click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await expect(page.locator(".moves")).toHaveText("0 moves");
});

test("under five moves there is nothing to ask about", async ({ page }) => {
  await page.goto(DEAL);
  await page.locator(".slot-stock").tap();

  await openMenu(page);
  await page.getByRole("button", { name: "Replay this deal" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await expect(page.locator(".moves")).toHaveText("0 moves");
});
