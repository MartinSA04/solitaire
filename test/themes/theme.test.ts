import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Rgba,
  blocksOf,
  colorsIn,
  over,
  parseColor,
  ratio,
  read,
} from "./helpers.ts";

/**
 * Themes drift. A colour gets nudged to look nicer on the one screen the
 * person nudging it owns, and six months later the empty slots have vanished
 * on everyone else's.
 *
 * So the two things docs say about a theme are asserted here rather than left
 * to review: the token contract in docs/04-art-direction.md (a theme is
 * nothing but this set, and a theme that leaves one out is incomplete), and
 * the contrast table in docs/08-accessibility.md.
 */

/**
 * The contract, minus `--card-radius`: that one is geometry, and geometry has
 * a single owner — Layout.ts writes it onto `.board` on every resize. The last
 * group is the deck surface, which docs/04 describes as the deck's rather than
 * the table's, but which has to be *somewhere* and is a theme's business as
 * much as its felt is.
 */
const CONTRACT = [
  "--table-bg",
  "--table-texture",
  "--table-vignette",
  "--slot-stroke",
  "--slot-fill",
  "--card-shadow-rest",
  "--card-shadow-lift",
  "--card-stroke",
  "--card-stroke-width",
  "--accent",
  "--accent-contrast",
  "--chrome-bg",
  "--chrome-fg",
  "--chrome-fg-dim",
  "--sheet-bg",
  "--win-bloom",
  "--win-trail-blend",
  "--card-bg",
  "--card-fg",
  "--suit-clubs",
  "--suit-diamonds",
  "--suit-hearts",
  "--suit-spades",
  "--back-bg",
  "--back-ink",
  "--back-edge",
].sort();

interface Variant {
  name: string;
  file: string;
  /** The `[data-theme="..."]` the theme is selected by. */
  attribute: string;
  /** Which `@media` blocks in the file are part of this variant. */
  media: (query: string) => boolean;
  /** A variant that only overrides another, and so defines a subset. */
  override?: true;
}

const VARIANTS: Variant[] = [
  {
    name: "warm",
    file: "src/themes/warm.css",
    attribute: '[data-theme="warm"]',
    media: () => false,
  },
  {
    name: "minimal (light)",
    file: "src/themes/minimal.css",
    attribute: '[data-theme="minimal"]',
    media: () => false,
  },
  {
    // The one theme that respects the OS: the other two *are* a light choice.
    name: "minimal (dark)",
    file: "src/themes/minimal.css",
    attribute: '[data-theme="minimal"]',
    media: (query) => query.includes("prefers-color-scheme: dark"),
    override: true,
  },
  {
    name: "dark",
    file: "src/themes/dark.css",
    attribute: '[data-theme="dark"]',
    media: () => false,
  },
];

/** Every token the theme file itself sets for this variant, in file order. */
function declared(variant: Variant): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const block of blocksOf(read(variant.file))) {
    if (!block.selector.includes(variant.attribute)) continue;
    if (block.media !== null && !variant.media(block.media)) continue;
    for (const [name, value] of block.declarations) tokens.set(name, value);
  }
  return tokens;
}

/** What the browser would actually resolve: the fallbacks, then the theme. */
function resolved(variant: Variant): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const block of blocksOf(read("src/themes/tokens.css"))) {
    if (block.selector !== ":root") continue;
    for (const [name, value] of block.declarations) tokens.set(name, value);
  }
  for (const [name, value] of declared(variant)) tokens.set(name, value);
  return tokens;
}

function color(tokens: Map<string, string>, name: string): Rgba {
  const value = tokens.get(name);
  assert.ok(value !== undefined, `${name} is not defined`);
  const parsed = parseColor(value);
  assert.ok(parsed !== null, `${name}: ${value} is not a single colour`);
  return parsed;
}

/** A gradient's stops, or a flat colour's one colour. */
function stops(tokens: Map<string, string>, name: string): Rgba[] {
  const value = tokens.get(name);
  assert.ok(value !== undefined, `${name} is not defined`);
  const found = colorsIn(value);
  assert.ok(found.length > 0, `${name}: ${value} holds no colour`);
  return found;
}

/** The worst backdrop the table offers, which is the one everything is judged against. */
function tableStops(tokens: Map<string, string>): Rgba[] {
  return stops(tokens, "--table-bg");
}

function atLeast(
  observed: number,
  required: number,
  what: string,
  where: string,
): void {
  assert.ok(
    observed >= required,
    `${where}: ${what} is ${observed}:1, needs ${required}:1`,
  );
}

describe("theme token contract", () => {
  it("is what the fallbacks in tokens.css define", () => {
    const fallback = blocksOf(read("src/themes/tokens.css")).find(
      (block) => block.selector === ":root",
    );
    assert.ok(fallback !== undefined);
    const defined = [...fallback.declarations.keys()]
      .filter((name) => name !== "--card-radius")
      .sort();
    assert.deepEqual(defined, CONTRACT);
  });

  for (const variant of VARIANTS.filter((v) => v.override !== true)) {
    it(`is defined in full by ${variant.name}`, () => {
      // Exactly the contract: a theme that invents a token of its own has put
      // a decision somewhere the other themes cannot answer it.
      assert.deepEqual([...declared(variant).keys()].sort(), CONTRACT);
    });
  }

  it("is overridden, never extended, by minimal's dark variant", () => {
    const dark = VARIANTS.find((v) => v.name === "minimal (dark)") as Variant;
    for (const name of declared(dark).keys()) {
      assert.ok(CONTRACT.includes(name), `${name} is not in the contract`);
    }
  });
});

/**
 * The table from docs/08-accessibility.md, one assertion per row.
 *
 * The card-against-table row is the interesting one. It asks for the card to
 * be *separable* from the table, which a dark table gives for free and the
 * Minimal light theme cannot give at all — white on warm paper is 1.2:1, and
 * making it 4.5 would mean a mid-grey ground, which is not that theme. That is
 * what its hairline is for, so the check is 3:1 by the card's own background
 * *or* by the stroke at its edge. See docs/04-art-direction.md.
 */
describe("theme contrast", () => {
  for (const variant of VARIANTS) {
    describe(variant.name, () => {
      const tokens = resolved(variant);
      const where = variant.name;

      it("sets the card's ink 7:1 on the card", () => {
        const card = color(tokens, "--card-bg");
        for (const ink of [
          "--card-fg",
          "--suit-clubs",
          "--suit-diamonds",
          "--suit-hearts",
          "--suit-spades",
        ]) {
          atLeast(ratio(color(tokens, ink), card), 7, ink, where);
        }
      });

      it("keeps a face-up card separable from the table", () => {
        const card = color(tokens, "--card-bg");
        const edge = over(color(tokens, "--card-stroke"), card);
        for (const table of tableStops(tokens)) {
          const best = Math.max(ratio(card, table), ratio(edge, table));
          atLeast(best, 3, "card or its stroke against the table", where);
        }
      });

      it("keeps a face-down card separable from the table", () => {
        const back = color(tokens, "--back-bg");
        const edge = over(color(tokens, "--back-edge"), back);
        for (const table of tableStops(tokens)) {
          const best = Math.max(ratio(back, table), ratio(edge, table));
          atLeast(best, 3, "back or its edge against the table", where);
        }
      });

      it("outlines an empty pile 3:1 against the table", () => {
        for (const table of tableStops(tokens)) {
          const stroke = over(color(tokens, "--slot-stroke"), table);
          atLeast(ratio(stroke, table), 3, "--slot-stroke", where);
        }
      });

      it("reads its chrome text 4.5:1, and the clock 3:1", () => {
        const chrome = color(tokens, "--chrome-bg");
        const sheet = color(tokens, "--sheet-bg");
        const fg = color(tokens, "--chrome-fg");
        atLeast(ratio(over(fg, chrome), chrome), 4.5, "--chrome-fg", where);
        atLeast(
          ratio(over(fg, sheet), sheet),
          4.5,
          "--chrome-fg on a sheet",
          where,
        );
        atLeast(
          ratio(over(color(tokens, "--chrome-fg-dim"), chrome), chrome),
          3,
          "--chrome-fg-dim",
          where,
        );
      });

      it("shows the accent on the table and its label on the accent", () => {
        const accent = color(tokens, "--accent");
        atLeast(
          ratio(color(tokens, "--accent-contrast"), accent),
          4.5,
          "--accent-contrast",
          where,
        );
        for (const table of tableStops(tokens)) {
          atLeast(ratio(over(accent, table), table), 3, "--accent", where);
        }
      });
    });
  }
});
