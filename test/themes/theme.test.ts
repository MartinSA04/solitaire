import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  THEMES,
  type Variant,
  atLeast,
  blocksOf,
  colorOf,
  declaredIn,
  over,
  ratio,
  read,
  tableStops,
  tokensFor,
} from "./helpers.ts";

/**
 * Themes drift. A colour gets nudged to look nicer on the one screen the
 * person nudging it owns, and six months later the empty slots have vanished
 * on everyone else's.
 *
 * So the two things the docs say about a theme are asserted here rather than
 * left to review: the token contract in docs/04-art-direction.md (a theme is
 * nothing but this set, and one that leaves a token out is incomplete), and
 * the contrast table in docs/08-accessibility.md.
 */

/**
 * The contract, minus `--card-radius`: that one is geometry, and geometry has
 * a single owner — Layout.ts writes it onto `.board` on every resize. The last
 * group is the card surface, which docs/04 describes as the deck's rather than
 * the table's, but which has to have a default *somewhere*, and a warm table
 * wanting a warm white card is as much a decision about the table as its felt
 * is. A deck overrides what it disagrees with.
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

  for (const theme of THEMES.filter((t) => t.override !== true)) {
    it(`is defined in full by ${theme.name}`, () => {
      // Exactly the contract: a theme that invents a token of its own has put
      // a decision somewhere the other themes cannot answer it.
      assert.deepEqual([...declaredIn(theme).keys()].sort(), CONTRACT);
    });
  }

  it("is overridden, never extended, by minimal's dark variant", () => {
    const dark = THEMES.find((t) => t.name === "minimal (dark)") as Variant;
    for (const name of declaredIn(dark).keys()) {
      assert.ok(CONTRACT.includes(name), `${name} is not in the contract`);
    }
  });
});

/**
 * The table from docs/08-accessibility.md, one assertion per row. The ink on
 * the card is the deck's business and is checked in deck.test.ts, against
 * every table.
 *
 * The card-against-table row is the interesting one. It asks for the card to
 * be *separable* from the table, which a dark table gives for free and the
 * Minimal light theme cannot give at all — white on warm paper is 1.2:1, and
 * making it 4.5 would mean a mid-grey ground, which is not that theme. That is
 * what its hairline is for, so the check is 3:1 by the card's own background
 * *or* by the stroke at its edge. See docs/04-art-direction.md.
 */
describe("theme contrast", () => {
  for (const theme of THEMES) {
    describe(theme.name, () => {
      const tokens = tokensFor(theme);
      const where = theme.name;

      it("keeps a face-up card separable from the table", () => {
        const card = colorOf(tokens, "--card-bg");
        const edge = over(colorOf(tokens, "--card-stroke"), card);
        for (const table of tableStops(tokens)) {
          const best = Math.max(ratio(card, table), ratio(edge, table));
          atLeast(best, 3, "card or its stroke against the table", where);
        }
      });

      it("keeps a face-down card separable from the table", () => {
        const back = colorOf(tokens, "--back-bg");
        const edge = over(colorOf(tokens, "--back-edge"), back);
        for (const table of tableStops(tokens)) {
          const best = Math.max(ratio(back, table), ratio(edge, table));
          atLeast(best, 3, "back or its edge against the table", where);
        }
      });

      it("outlines an empty pile 3:1 against the table", () => {
        for (const table of tableStops(tokens)) {
          const stroke = over(colorOf(tokens, "--slot-stroke"), table);
          atLeast(ratio(stroke, table), 3, "--slot-stroke", where);
        }
      });

      it("reads its chrome text 4.5:1, and the clock 3:1", () => {
        const chrome = colorOf(tokens, "--chrome-bg");
        const sheet = colorOf(tokens, "--sheet-bg");
        const fg = colorOf(tokens, "--chrome-fg");
        atLeast(ratio(over(fg, chrome), chrome), 4.5, "--chrome-fg", where);
        atLeast(
          ratio(over(fg, sheet), sheet),
          4.5,
          "--chrome-fg on a sheet",
          where,
        );
        // 4.5, not the 3 docs/08 first wrote. The clock and the move counter
        // are ordinary 15px text, and WCAG 2.2 AA asks 4.5 of ordinary text
        // whatever a designer meant by "deliberately dim" — which the axe gate
        // in e2e/axe.pw.ts pointed out the moment it was run against a light
        // table for the first time.
        atLeast(
          ratio(over(colorOf(tokens, "--chrome-fg-dim"), chrome), chrome),
          4.5,
          "--chrome-fg-dim",
          where,
        );
      });

      it("shows the accent on the table and its label on the accent", () => {
        const accent = colorOf(tokens, "--accent");
        atLeast(
          ratio(colorOf(tokens, "--accent-contrast"), accent),
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
