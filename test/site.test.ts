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

/**
 * The counter is one endpoint, named once, and loaded by the one layout every
 * page goes through — so "is it on this page?" is never a question asked per
 * page. What this pins is that nobody pastes the GoatCounter snippet into a
 * page by hand later: a second copy is how one page ends up reporting into a
 * different account, or how a page quietly stops reporting at all.
 *
 * The other half is the promise on `/credits`. A counter the player is not
 * told about is the thing docs/01 says this site does not do, and that page is
 * where it gets said — so it has to still say it.
 */
describe("the pageview counter", () => {
  it("is loaded by the layout every page shares", () => {
    const layout = read("src/layouts/Layout.astro");
    assert.match(layout, /import \{ ANALYTICS \} from "\.\.\/site\.ts"/);
    assert.match(layout, /src="https:\/\/gc\.zgo\.at\/count\.js"/);
    assert.match(layout, /data-goatcounter=\{`\$\{ANALYTICS\}\/count`\}/);
  });

  it("names its endpoint in exactly one place", () => {
    assert.match(
      read("src/site.ts"),
      /export const ANALYTICS = "https:\/\/[\w-]+\.goatcounter\.com"/,
    );
    for (const file of [
      "src/pages/index.astro",
      "src/pages/credits.astro",
      "src/pages/how-to-play.astro",
    ]) {
      assert.equal(
        read(file).includes("gc.zgo.at"),
        false,
        `${file} loads the counter itself instead of leaving it to the layout`,
      );
    }
  });

  it("is disclosed to the player on /credits", () => {
    const credits = read("src/pages/credits.astro");
    assert.match(credits, /goatcounter\.com/i);
    // The specific claims that stop being true if the counter ever changes.
    assert.match(credits, /sets no cookie/i);
    assert.match(credits, /What this site counts/i);
  });
});

/**
 * `/how-to-play` renders the shortcut table out of `src/game/strings.ts`, which
 * is the same list `?` shows and `test/game/keyboard.test.ts` presses every key
 * in. This is what stops somebody writing the keys out by hand into the page
 * later: a page that promises a key the game does not honour is worse than no
 * page, and a second copy of the list is how that happens.
 */
describe("the pages that are not the game", () => {
  it("takes the shortcut list from the module the game answers to", () => {
    const page = read("src/pages/how-to-play.astro");
    assert.match(page, /import \{ SHORTCUTS \} from "\.\.\/game\/strings\.ts"/);
    assert.match(page, /SHORTCUTS\.map/);
    // Every key the page shows is one the list gave it, not one typed here.
    for (const key of ["Space", "Undo", "New deal"]) {
      assert.equal(
        page.includes(`<kbd>${key}</kbd>`),
        false,
        `${key} is written into the page by hand`,
      );
    }
  });

  it("is reachable from the game and from the other page", () => {
    assert.match(
      read("src/game/chrome/SettingsSheet.svelte"),
      /href="\/how-to-play\/"/,
    );
    assert.match(read("src/pages/credits.astro"), /href="\/how-to-play\/"/);
    assert.match(read("src/pages/how-to-play.astro"), /href="\/credits\/"/);
    assert.match(read("src/pages/how-to-play.astro"), /href="\/"/);
  });
});
