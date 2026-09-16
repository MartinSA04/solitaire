import { type Page, expect, test } from "@playwright/test";
import { SOURCED } from "../src/decks/sourced.ts";
import { DECK_SIZE } from "../src/engine/index.ts";

/**
 * The deck gallery, and the sixteen decks it hands out.
 *
 * This is the gate that matters for a sourced deck, and it is not a
 * screenshot. A deck arrives as somebody else's SVG and is wired to the board
 * by a committed table of numbers; the ways that goes wrong are all
 * *silent* — a card that points at an id the sprite does not have renders as
 * nothing, a grid one cell out renders the wrong card, a sprite left in the
 * document alongside another one renders the first deck for both. None of
 * those throws, and a person looking at a board of the right shape can easily
 * not notice that the seven of clubs is showing an eight.
 *
 * So every deck in the registry is put on the table here and asked for all 52
 * of its cards, in a real browser, and the answers are checked against what
 * the deck itself says it drew.
 */

const DEAL = "/?deal=24";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function openGallery(page: Page) {
  await page.goto(DEAL);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /^Deck/ }).click();
  const decks = page.getByRole("dialog", { name: "Decks" });
  await expect(decks).toBeVisible();
  return decks;
}

async function pick(page: Page, id: string) {
  const decks = page.getByRole("dialog", { name: "Decks" });
  await decks.locator(`label:has(input[value="${id}"])`).click();
  await decks.getByRole("button", { name: "Close" }).click();
  await expect(decks).toHaveCount(0);
}

test("offers every deck, and downloads none of them to do it", async ({
  page,
}) => {
  const sprites: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("deck.svg")) sprites.push(request.url());
  });

  const decks = await openGallery(page);
  // Twenty-one decks and "Match the table".
  await expect(decks.getByRole("radio")).toHaveCount(22);
  // Looking is free. This is the whole point of the gallery: the previews are
  // a few kilobytes each and the decks themselves are not fetched until one is
  // chosen.
  expect(sprites).toHaveLength(0);
});

test("says what a deck costs, and that ours cost nothing", async ({ page }) => {
  const decks = await openGallery(page);
  const ours = decks.locator('label:has(input[value="minimal"])');
  await expect(ours).toContainText("No download");

  const heaviest = decks.locator('label:has(input[value="french"])');
  await expect(heaviest).toContainText("KB");
});

/**
 * The real test, once per deck: choose it, then ask the page what all 52 cards
 * are actually drawing.
 *
 * `getBBox()` on the `<use>` is what the browser will paint, so a card that
 * points at nothing, or at a cell off the edge of the sheet, measures zero and
 * fails here. The boxes are then compared against the registry's own numbers —
 * which is what catches a lattice that is right for one row and wrong for the
 * next.
 */
for (const deck of SOURCED) {
  test(`${deck.name} draws all 52 of its cards`, async ({ page }) => {
    await openGallery(page);
    await pick(page, deck.id);

    await expect(page.locator(`[data-sprite="${deck.id}"]`)).toHaveCount(1);
    // One sprite in the document, ever. Every deck in this family names its
    // cards `club_7`, so two of them at once means every card on the table
    // draws from whichever arrived first.
    await expect(page.locator("[data-sprite]")).toHaveCount(1);
    await expect(page.locator(".card-layer.has-art")).toHaveCount(1);

    const drawn = await page.evaluate(() => {
      const out: { card: number; w: number; h: number; href: string }[] = [];
      for (const use of document.querySelectorAll<SVGUseElement>(
        ".card-art use",
      )) {
        const card = Number(
          (use.closest("[data-card]") as HTMLElement).dataset.card,
        );
        const box = use.getBBox();
        out.push({
          card,
          w: box.width,
          h: box.height,
          href: use.getAttribute("href") ?? "",
        });
      }
      return out;
    });

    expect(drawn).toHaveLength(DECK_SIZE);
    for (const { card, w, h, href } of drawn) {
      expect(href, `card ${card} points nowhere`).toBe(`#${deck.symbol(card)}`);
      expect(w, `card ${card} draws nothing`).toBeGreaterThan(0);
      expect(h, `card ${card} draws nothing`).toBeGreaterThan(0);
    }
  });
}

test("a sourced deck is printed on its own back", async ({ page }) => {
  await openGallery(page);
  await pick(page, "anglo-poker");

  await expect(page.locator(".card-layer.has-art-back")).toHaveCount(1);
  const back = page.locator('.card[data-card="0"] .card-back-art use');
  await expect(back).toHaveAttribute("href", "#back");
  // Twenty-eight cards are face down at deal time and they all reference the
  // one group, so this is one drawing on screen 28 times rather than 28.
  await expect(page.locator(".card-back-art use")).toHaveCount(52);
});

test("a deck we draw takes one of our patterns, and no sprite at all", async ({
  page,
}) => {
  await openGallery(page);
  await pick(page, "vintage");

  await expect(page.locator("[data-sprite]")).toHaveCount(0);
  await expect(page.locator(".card-layer.has-art")).toHaveCount(0);
  await expect(page.locator(".card-layer.has-art-back")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.back)).toBe(
    "pinstripe",
  );
});

test("a downloaded deck stays on the device", async ({ page }) => {
  await openGallery(page);
  await pick(page, "minium");
  await expect(page.locator('[data-sprite="minium"]')).toHaveCount(1);

  // A reload is a cold start with a warm cache: the gallery says so, and the
  // sprite comes back without the network. See `CACHE` in src/game/DeckArt.ts —
  // this is Cache Storage, not a service worker.
  const decks = await openGallery(page);
  await expect(decks.locator('label:has(input[value="minium"])')).toContainText(
    "on this device",
  );
});

test("the large index is a choice, and it is off", async ({ page }) => {
  await openGallery(page);
  await pick(page, "paris");

  const index = page.locator('.card[data-card="0"] .card-index');
  await expect(index).not.toBeVisible();

  const decks = await openGallery(page);
  await decks.getByText("Large index over the art").click();
  await decks.getByRole("button", { name: "Close" }).click();

  // Ours, on the deck's own paper, in the corner a fanned column shows.
  await expect(index).toBeVisible();
  await expect(page.locator(".card-layer.has-our-index")).toHaveCount(1);
});

test("a deck that will not download leaves the one on the table alone", async ({
  page,
}) => {
  await page.route("**/decks/plastic/deck.svg", (route) => route.abort());

  await openGallery(page);
  await pick(page, "plastic");

  // The setting took — the player chose this deck and that choice is theirs —
  // but there is no art, so the typographic face underneath is what stays on
  // screen. No dialog, no toast, no error: a deck is a preference.
  expect(await page.evaluate(() => document.documentElement.dataset.deck)).toBe(
    "plastic",
  );
  await expect(page.locator(".card-layer.has-art")).toHaveCount(0);
  await expect(page.locator(".card[data-card='0'] .card-index")).toBeVisible();

  const decks = await openGallery(page);
  await expect(
    decks.locator('label:has(input[value="plastic"])'),
  ).toContainText("Didn't download");
});
