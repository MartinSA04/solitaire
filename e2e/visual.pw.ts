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
 * The decks we draw take their ink from the table, so each one of them against
 * each table is a combination that can actually go wrong, and all nine are
 * here. The sourced deck cannot: its art is the same art on every table, and
 * all that changes behind it is the felt. It is shot on the warm table and on
 * the dark one — a white-paper deck on a near-black table being the pairing
 * worth looking at — rather than on all three.
 *
 * The trimming is not fastidiousness. Every baseline is a quarter of a
 * megabyte of PNG committed for good, and a suite nobody wants to regenerate
 * is a suite that gets deleted.
 */
const DECKS = [
  { id: "minimal", label: "Minimal", tables: ["warm", "minimal", "dark"] },
  {
    id: "high-contrast",
    label: "High contrast",
    tables: ["warm", "minimal", "dark"],
  },
  {
    id: "four-colour",
    label: "Four colour",
    tables: ["warm", "minimal", "dark"],
  },
  { id: "french", label: "French", tables: ["warm", "dark"] },
] as const;

/**
 * The sizes the layout is designed against, on one table. What changes between
 * them is geometry, and geometry does not know which theme is on — Layout.ts
 * is handed an area and returns numbers. Warm is the table with the most in it
 * to go wrong: a gradient, a weave and a vignette.
 */
const SIZES = [
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

function choose(page: Page, group: string, label: string) {
  return page
    .getByRole("group", { name: group })
    .getByText(label, { exact: true })
    .click();
}

/** Open the game, pick a table and a deck through the sheet, and settle. */
async function dress(
  page: Page,
  table: string,
  deck: string,
  label: { table: string; deck: string },
): Promise<void> {
  await page.goto(DEAL);
  await page.getByRole("button", { name: "Menu" }).click();
  await choose(page, "Table", label.table);
  await choose(page, "Cards", label.deck);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);

  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(table);
  // A sourced deck is a fetch, and the shot has to wait for it or it catches
  // the typographic face mid-crossfade.
  if (deck === "french") {
    await expect(page.locator(".card-layer.has-art")).toHaveCount(1);
  }
}

test.describe("every deck on every table", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const deck of DECKS) {
    for (const table of TABLES.filter((t) =>
      (deck.tables as readonly string[]).includes(t.id),
    )) {
      test(`${table.id} · ${deck.id}`, async ({ page }) => {
        await dress(page, table.id, deck.id, {
          table: table.label,
          deck: deck.label,
        });
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
    await dress(page, "minimal", "minimal", {
      table: "Minimal",
      deck: "Minimal",
    });
    await expect(page).toHaveScreenshot("minimal-dark-phone.png", TOLERANCE);
  });
});

test.describe("the board at every size", () => {
  for (const size of SIZES) {
    test(`warm · ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      // "Match the table": the deck a player who never opens the sheet twice
      // actually sees.
      await dress(page, "warm", "minimal", {
        table: "Warm",
        deck: "Match the table",
      });
      await expect(page).toHaveScreenshot(`warm-${size.name}.png`, TOLERANCE);
    });
  }
});
