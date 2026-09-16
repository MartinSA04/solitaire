import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DECKS,
  THEMES,
  type Variant,
  atLeast,
  colorOf,
  declaredIn,
  hue,
  over,
  ratio,
  saturation,
  tableStops,
  tokensFor,
} from "./helpers.ts";

/**
 * The decks we draw ourselves, checked the way the themes are: every deck on
 * every table, because "any deck works on any table" is a claim in
 * docs/04-art-direction.md and twelve combinations is not something anyone is
 * going to look at by hand.
 *
 * The rule that matters is 7:1 for the ink on the card — docs/08's strictest
 * row, and the one that decides whether a rank can be read at arm's length
 * with reading glasses off. It is why the reds in this product are darker than
 * a printed card's, and why the four-colour deck's blue is navy.
 */

/**
 * What a deck is allowed to say. A deck owns the ink and the type; everything
 * else about a card — how warm its background is, its edge, its shadow —
 * belongs to the table, which is why `--card-bg` is the one surface token on
 * this list and only the High-contrast deck sets it.
 */
const DECK_TOKENS = [
  "--card-bg",
  "--card-fg",
  "--suit-clubs",
  "--suit-diamonds",
  "--suit-hearts",
  "--suit-spades",
  "--index-size",
  "--index-weight",
  "--index-suit-scale",
  "--pip-size",
];

/** The type scale every card face is drawn from, whatever its colours. */
const GEOMETRY = [
  "--index-size",
  "--index-suit-scale",
  "--index-weight",
  "--pip-size",
];

const SUITS = [
  "--suit-clubs",
  "--suit-diamonds",
  "--suit-hearts",
  "--suit-spades",
];

function named(variants: Variant[], name: string): Variant {
  const found = variants.find((variant) => variant.name === name);
  assert.ok(found !== undefined, `no variant named ${name}`);
  return found;
}

describe("deck token contract", () => {
  for (const deck of DECKS) {
    it(`is respected by ${deck.name}`, () => {
      for (const name of declaredIn(deck).keys()) {
        assert.ok(
          DECK_TOKENS.includes(name),
          `${deck.name} sets ${name}, which is the table's to decide`,
        );
      }
    });
  }

  it("is given its defaults by the minimal deck", () => {
    // Minimal is the deck the others are a variation of, and the only one that
    // has to be complete: they inherit its type scale, and it inherits the
    // table's ink, which is what makes it the theme's own typography rather
    // than a deck laid on top of it.
    const minimal = [...declaredIn(named(DECKS, "minimal")).keys()].sort();
    assert.deepEqual(minimal, GEOMETRY);
  });
});

describe("deck contrast", () => {
  for (const deck of DECKS) {
    for (const theme of THEMES) {
      describe(`${deck.name} on ${theme.name}`, () => {
        const tokens = tokensFor(theme, deck);
        const where = `${deck.name} on ${theme.name}`;

        it("sets every ink 7:1 on the card", () => {
          const card = colorOf(tokens, "--card-bg");
          for (const ink of ["--card-fg", ...SUITS]) {
            atLeast(ratio(colorOf(tokens, ink), card), 7, ink, where);
          }
        });

        it("leaves the card separable from the table", () => {
          // A deck that overrides the card's background — High-contrast does,
          // so as to be the same deck on every table — has to clear the same
          // bar the table's own card surface does.
          const card = colorOf(tokens, "--card-bg");
          const edge = over(colorOf(tokens, "--card-stroke"), card);
          for (const table of tableStops(tokens)) {
            const best = Math.max(ratio(card, table), ratio(edge, table));
            atLeast(best, 3, "card or its stroke against the table", where);
          }
        });
      });
    }
  }
});

/**
 * Four colours, or it is not a four-colour deck.
 *
 * Contrast is the wrong instrument here and worth saying why: navy and forest
 * green are a hair apart in *luminance* — about 1.1:1 — and unmistakable to
 * look at, because what separates them is hue. So this asserts what the deck
 * actually promises: one near-neutral ink for spades and three saturated ones
 * far enough apart on the wheel that no two of them are the same colour.
 */
describe("the four-colour deck", () => {
  const tokens = tokensFor(named(THEMES, "warm"), named(DECKS, "four-colour"));
  const inks = SUITS.map((name) => ({ name, color: colorOf(tokens, name) }));

  it("keeps spades neutral and the other three saturated", () => {
    for (const { name, color } of inks) {
      const s = saturation(color);
      if (name === "--suit-spades") {
        assert.ok(s < 0.2, `${name} is coloured (saturation ${s.toFixed(2)})`);
      } else {
        assert.ok(
          s > 0.5,
          `${name} is washed out (saturation ${s.toFixed(2)})`,
        );
      }
    }
  });

  it("puts its three hues a long way apart", () => {
    const coloured = inks.filter(({ name }) => name !== "--suit-spades");
    for (let a = 0; a < coloured.length; a++) {
      for (let b = a + 1; b < coloured.length; b++) {
        const one = coloured[a] as (typeof coloured)[number];
        const other = coloured[b] as (typeof coloured)[number];
        const apart = Math.abs(hue(one.color) - hue(other.color));
        const degrees = Math.min(apart, 360 - apart);
        assert.ok(
          degrees >= 60,
          `${one.name} and ${other.name} are ${Math.round(degrees)}° apart`,
        );
      }
    }
  });
});
