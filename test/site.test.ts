import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The canonical origin is named in three files that cannot import each other:
 * astro.config.mjs (canonical/OG/sitemap URLs), public/CNAME (what GitHub Pages
 * serves the site as) and public/robots.txt (the Sitemap: line crawlers follow).
 * Nothing at build time notices when they disagree — the site just quietly
 * publishes canonical URLs for a host it isn't served at.
 */
const HOST = "solitaire.martinsundal.no";

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("canonical host", () => {
  it("is what astro.config.mjs builds URLs against", () => {
    assert.match(
      read("astro.config.mjs"),
      new RegExp(`site:\\s*"https://${HOST}"`),
    );
  });

  it("is what GitHub Pages serves the site as", () => {
    assert.equal(read("public/CNAME").trim(), HOST);
  });

  it("is what robots.txt points crawlers at", () => {
    assert.match(
      read("public/robots.txt"),
      new RegExp(`Sitemap: https://${HOST}/`),
    );
  });
});
