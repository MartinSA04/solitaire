import { type Page, expect, test } from "@playwright/test";

/**
 * A screenshot of every table crossed with every deck, plus each table at the
 * three sizes the layout is designed against.
 *
 * This is the suite docs/07-architecture.md asks for and the only one that can
 * catch what it catches. `test/themes/` proves the tokens clear their contrast
 * ratios, which is arithmetic; it cannot notice that a card back went missing,
 * that a deck's index is sitting on top of its own pip, or that the felt
 * texture is tiling at the wrong scale. Those are only visible.
 *
 * Every shot is of a freshly dealt `?deal=24`, which is fixed forever, with
 * the clock at zero and no move played — so the only thing that varies between
 * two runs is the thing under test.
 *
 * **Reduced motion is on for the whole file.** It collapses every duration to
 * 1ms, so the board is at rest by the time anything is captured, and it is a
 * far more reliable way to get there than waiting out a deal.
 *
 * Baselines are per platform and were generated on Linux, which is what CI
 * runs. The tolerance below is for font rasterisation, which differs a little
 * between machines with the same fonts; it is deliberately small enough that a
 * changed colour or a missing element still fails. Regenerate with
 * `pnpm test:e2e:update` when a change to the look is intended — and look at
 * what changed before committing it, because that is the entire point of the
 * suite.
 */

const DEAL = "/?deal=24";

test.use({ reducedMotion: "reduce" });

/** Enough for a rasterisation difference, nowhere near a design change. */
const TOLERANCE = { maxDiffPixelRatio: 0.02 };

const TABLES = [
  { id: "warm", label: "Warm" },
  { id: "minimal", label: "Minimal" },
  { id: "dark", label: "Dark" },
] as const;

/**
 * A deck that takes its ink from the table is a different drawing on each of
 * them, so every such pairing is a combination that can actually go wrong and
 * all five of ours are here on all three tables — bar Vintage, which brings
 * its own paper and is shot on the warm table and the dark one, a light card
 * on a near-black table being the pairing worth looking at.
 *
 * A deck we did **not** draw takes nothing from the table at all: it is
 * somebody's drawing, on its own paper, printed on its own back, and the only
 * thing a second table changes behind it is the felt. So those get one shot
 * each, on the warm table. Sixteen decks on three tables would be thirty-two
 * more baselines to show the same cards on a different green.
 *
 * The trimming is not fastidiousness. Every baseline is a quarter of a
 * megabyte of PNG committed for good, and a suite nobody wants to regenerate
 * is a suite that gets deleted.
 *
 * What the sourced shots are for is the one thing no other test can see:
 * e2e/decks.pw.ts proves all 52 cards draw *something* and that it is the
 * group the registry names, but a lattice one cell out satisfies both and puts
 * the wrong rank on every card. Only a person looking at a picture catches it,
 * which is why these exist and why a change to one gets looked at.
 *
 * The card back comes with the deck rather than being chosen — see `DECK_BACK`
 * in src/game/settings.ts and `back` in src/decks/sourced.ts — so each of
 * these shots is also the only look at the back that deck is printed on.
 */
const DECKS = [
  { id: "minimal", tables: ["warm", "minimal", "dark"] },
  { id: "classic", tables: ["warm", "minimal", "dark"] },
  { id: "vintage", tables: ["warm", "dark"] },
  { id: "high-contrast", tables: ["warm", "minimal", "dark"] },
  { id: "four-colour", tables: ["warm", "minimal", "dark"] },
  { id: "minium", tables: ["warm"] },
  { id: "minium-dark", tables: ["warm"] },
  { id: "simplistic", tables: ["warm"] },
  { id: "tango-nuevo", tables: ["warm"] },
  { id: "pixelangelo-compact", tables: ["warm"] },
  { id: "pixelangelo", tables: ["warm"] },
  { id: "ornamental", tables: ["warm"] },
  { id: "plastic", tables: ["warm"] },
  { id: "neoclassical", tables: ["warm"] },
  { id: "neoclassical-four-colour", tables: ["warm"] },
  { id: "anglo", tables: ["warm"] },
  { id: "anglo-poker", tables: ["warm"] },
  { id: "atlasnye", tables: ["warm"] },
  { id: "paris", tables: ["warm"] },
  { id: "guyenne", tables: ["warm"] },
  { id: "french", tables: ["warm", "dark"] },
] as const;

/** The ids that arrive as a sprite, and so have to be waited for. */
const SOURCED_IDS = new Set(DECKS.slice(5).map((deck) => deck.id));

/**
 * The sizes the layout is designed against, on one table. What changes between
 * them is geometry, and geometry does not know which theme is on — Layout.ts
 * is handed an area and returns numbers. Warm is the table with the most in it
 * to go wrong: a gradient, a weave and a vignette.
 */
const SIZES = [
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
  // Supported, not optimised — and the one shape where the chrome collapses
  // for a reason other than width. See docs/05.
  { name: "landscape", width: 844, height: 390 },
] as const;

function choose(page: Page, group: string, label: string) {
  return page
    .getByRole("group", { name: group })
    .getByText(label, { exact: true })
    .click();
}

/**
 * Open the game, pick a table and a deck through the sheets, and settle.
 *
 * The deck is given by id rather than by name — "auto" for the one a player
 * who never opens anything gets — because the gallery is keyed by id and a
 * tile's accessible name is a whole sentence.
 */
async function dress(
  page: Page,
  table: string,
  deck: string,
  tableLabel: string,
): Promise<void> {
  await page.goto(DEAL);
  await page.getByRole("button", { name: "Menu" }).click();
  await choose(page, "Table", tableLabel);

  // The deck is chosen in its own sheet — see e2e/decks.pw.ts — so this leaves
  // the menu, picks the tile and comes back to the board.
  await page.getByRole("button", { name: /^Deck/ }).click();
  const decks = page.getByRole("dialog", { name: "Decks" });
  await expect(decks).toBeVisible();
  await decks.locator(`label:has(input[value="${deck}"])`).click();
  await decks.getByRole("button", { name: "Close" }).click();
  await expect(decks).toHaveCount(0);

  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(table);
  // A sourced deck is a fetch, and the shot has to wait for it or it catches
  // the typographic face mid-crossfade.
  if (SOURCED_IDS.has(deck as (typeof DECKS)[number]["id"])) {
    await expect(page.locator(".card-layer.has-art")).toHaveCount(1);
    await expect(page.locator(".card-layer.has-art-back")).toHaveCount(1);
  }
}

test.describe("every deck on every table", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const deck of DECKS) {
    for (const table of TABLES.filter((t) =>
      (deck.tables as readonly string[]).includes(t.id),
    )) {
      test(`${table.id} · ${deck.id}`, async ({ page }) => {
        await dress(page, table.id, deck.id, table.label);
        await expect(page).toHaveScreenshot(
          `${table.id}-${deck.id}-phone.png`,
          TOLERANCE,
        );
      });
    }
  }

  test("minimal follows the OS into the dark", async ({ page }) => {
    // The one table that has two looks rather than one, and the only place
    // `prefers-color-scheme` changes anything in the product.
    await page.emulateMedia({ colorScheme: "dark" });
    await dress(page, "minimal", "minimal", "Minimal");
    await expect(page).toHaveScreenshot("minimal-dark-phone.png", TOLERANCE);
  });
});

test("the Large card size is a board of its own", async ({ page }) => {
  // Bigger cards, five of the seven columns, and the top row wrapped onto two.
  // Enough of a rearrangement to be worth a picture.
  await page.addInitScript(() => {
    localStorage.setItem(
      "sol:v1:settings",
      JSON.stringify({ v: 1, theme: "warm", cardSize: "large" }),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(DEAL);
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  await expect(page.locator(".card.is-moving")).toHaveCount(0);
  await expect(page).toHaveScreenshot("warm-large-phone.png", TOLERANCE);
});

test.describe("the board at every size", () => {
  for (const size of SIZES) {
    test(`warm · ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      // "Match the table": the deck a player who never opens the sheet twice
      // actually sees.
      await dress(page, "warm", "auto", "Warm");
      await expect(page).toHaveScreenshot(`warm-${size.name}.png`, TOLERANCE);
    });
  }
});
