import { expect, test } from "@playwright/test";

/**
 * Smoke pass over the built site. Deliberately thin: it exists so the harness
 * (build -> astro preview -> drive Chromium) is proven working from the first
 * commit, rather than being stood up for the first time on the day it is needed.
 */
test("the page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("it publishes a canonical URL at the real host", async ({ page }) => {
  await page.goto("/");
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute(
    "href",
    /^https:\/\/solitaire\.martinsundal\.no\//,
  );
});
