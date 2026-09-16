import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

/**
 * The gate from docs/08-accessibility.md: **zero axe violations**, on the game
 * page and on every surface the chrome can put in front of it.
 *
 * What this is and is not worth saying out loud, because an automated audit is
 * the easiest accessibility work to mistake for all of it. axe finds perhaps a
 * third of what is wrong with a page, and none of the third that matters most
 * here — whether the game can actually be played. That is
 * `e2e/keyboard.pw.ts`'s job, and the manual VoiceOver and TalkBack passes'.
 * What this catches is the other kind of bug: a control that lost its name in
 * a refactor, a heading order that drifted, a token nudged under 4.5:1. Those
 * are cheap to find and embarrassing to ship, which is exactly what a gate is
 * for.
 *
 * It runs against every theme, because two of the rules axe checks are about
 * colour and the product has three tables and four decks to get them wrong on.
 */

const THEMES = ["warm", "minimal", "dark"] as const;

const DEAL = "/?deal=24";

/**
 * WCAG 2.2 AA, which is the target, plus axe's own best-practice pack — the
 * one that objects to a region with no landmark and a list with a stray child,
 * neither of which is a WCAG failure and both of which are worth knowing.
 */
const TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

async function audit(page: Page, within?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  return (within === undefined ? builder : builder.include(within)).analyze();
}

/** The violations, as something a person can read in a CI log. */
function describe(results: { violations: readonly unknown[] }): string {
  const violations = results.violations as {
    id: string;
    help: string;
    nodes: { html: string; failureSummary?: string }[];
  }[];
  return violations
    .map(
      (violation) =>
        `${violation.id}: ${violation.help}\n` +
        violation.nodes
          .map((node) => `    ${node.html}\n    ${node.failureSummary ?? ""}`)
          .join("\n"),
    )
    .join("\n\n");
}

async function dealt(page: Page): Promise<void> {
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  await expect(page.locator(".card.is-moving")).toHaveCount(0);
}

/**
 * Choose settings the way the sheet does, before the page is looked at.
 *
 * `v: 1` is load-bearing and easy to leave out: the inline bootstrap that puts
 * the table on `<html>` before the first paint does not check the schema
 * version, but `Persist` does — so a record without it paints the right table
 * and then has the default written straight back over it the moment the island
 * hydrates. An audit run that way is an audit of the Warm table wearing
 * somebody else's name.
 */
async function withSettings(
  page: Page,
  settings: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key as string, value as string);
    },
    ["sol:v1:settings", JSON.stringify({ v: 1, ...settings })],
  );
}

for (const theme of THEMES) {
  test(`the board has no violations on the ${theme} table`, async ({
    page,
  }) => {
    await withSettings(page, { theme });
    await page.goto(DEAL);
    await dealt(page);
    // The table the island settled on, not the one the bootstrap guessed.
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const results = await audit(page);
    expect(describe(results), describe(results)).toBe("");
  });
}

test("the board with a card in hand has none either", async ({ page }) => {
  await page.goto(DEAL);
  await dealt(page);

  // A pickup changes the board's state without changing its markup, which is
  // exactly the kind of thing that leaves a label describing the wrong pile.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("s");
  await page.keyboard.press(" ");
  await expect(page.locator(".card.is-held")).toHaveCount(1);

  const results = await audit(page);
  expect(describe(results), describe(results)).toBe("");
});

test("the Large board has none, pager and all", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withSettings(page, { theme: "warm", cardSize: "large" });
  await page.goto(DEAL);
  await dealt(page);
  await expect(page.locator(".pager")).toBeVisible();

  const results = await audit(page);
  expect(describe(results), describe(results)).toBe("");
});

test("the menu has none", async ({ page }) => {
  await page.goto(DEAL);
  await dealt(page);
  await page.getByRole("button", { name: "Menu" }).click();

  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  const results = await audit(page, ".sheet");
  expect(describe(results), describe(results)).toBe("");
});

test("the statistics have none", async ({ page }) => {
  await page.goto(DEAL);
  await dealt(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Statistics" }).click();

  await expect(page.getByRole("dialog", { name: "Statistics" })).toBeVisible();
  const results = await audit(page, ".sheet");
  expect(describe(results), describe(results)).toBe("");
});

test("the shortcut list has none", async ({ page }) => {
  await page.goto(DEAL);
  await dealt(page);
  await page.keyboard.press("?");

  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  const results = await audit(page, ".sheet");
  expect(describe(results), describe(results)).toBe("");
});

test("how to play has none", async ({ page }) => {
  await page.goto("/how-to-play/");
  const results = await audit(page);
  expect(describe(results), describe(results)).toBe("");
});

test("the credits have none", async ({ page }) => {
  // Not a surface docs/08 listed, because it did not exist when the list was
  // written. It is a page a licence obligation is honoured on and a player can
  // reach in two taps, which makes it as much a part of the product as the
  // board is.
  await page.goto("/credits");
  const results = await audit(page);
  expect(describe(results), describe(results)).toBe("");
});

test("the result panel has none", async ({ page }) => {
  // `?win` runs the whole sequence without one having been won, and skipping
  // it lands on the panel — which is the surface being audited.
  await page.goto("/?deal=24&win&winseed=1");
  await page.locator(".win-veil").click();
  await expect(page.locator(".result")).toBeVisible();

  const results = await audit(page);
  expect(describe(results), describe(results)).toBe("");
});
