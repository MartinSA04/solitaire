import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, it } from "node:test";
import { DECK_SIZE, cardName } from "../../src/engine/index.ts";
import { OURS, SOURCED, cardBox, deckAspect } from "../../src/decks/sourced.ts";
import { CATALOGUE, wireSize } from "../../src/decks/catalogue.ts";
import { DECKS } from "../../src/game/settings.ts";

/**
 * A deck we did not draw is two obligations and one mapping, and all three are
 * checkable without a browser: the sprite is here, every card in it is findable
 * by the id we will ask for, and the licence it arrived under ships beside it.
 *
 * The mapping is the interesting one. Nothing at runtime notices a `<use>`
 * pointing at an id that isn't there — the card simply renders as nothing — so
 * the check is made against the shipped file itself rather than against a list
 * of ids copied out of it.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const exists = (path: string) =>
  existsSync(new URL(`../../${path}`, import.meta.url));

describe("sourced decks", () => {
  for (const deck of SOURCED) {
    describe(deck.name, () => {
      /** `public/` is served from the root, so the URL is the path. */
      const file = `public${deck.sprite}`;

      it("ships the sprite it points at", () => {
        assert.ok(exists(file), `${file} is missing`);
      });

      it("names a group in it for every one of the 52 cards", () => {
        const sprite = read(file);
        const ids = new Set(
          [...sprite.matchAll(/id="([^"]+)"/g)].map((match) => match[1]),
        );
        const seen = new Set<string>();
        for (let card = 0; card < DECK_SIZE; card++) {
          const symbol = deck.symbol(card);
          assert.ok(
            ids.has(symbol),
            `${cardName(card)} wants #${symbol}, which is not in the sprite`,
          );
          assert.ok(!seen.has(symbol), `#${symbol} is used twice`);
          seen.add(symbol);
        }
      });

      it("ships the licence it arrived under", () => {
        // The obligation docs/04 will not let a deck into the repo without.
        const licence = `public/decks/${deck.id}/LICENSE.txt`;
        assert.ok(exists(licence), `${licence} is missing`);
        const text = read(licence);
        for (const author of deck.credit.authors) {
          assert.ok(
            text.includes(author),
            `${licence} does not name ${author}`,
          );
        }
      });

      /**
       * The lattice, checked without a browser: 52 cells, all the same size,
       * none of them the same cell twice, and something like a card's shape.
       *
       * What this cannot see is whether a cell holds the card it is supposed
       * to — that needs the sprite rendered, which is
       * `node scripts/deck-geometry.ts --verify` and `e2e/decks.pw.ts`. What
       * it does catch is the cheap half: a step of zero on a sheet that is a
       * grid, which would silently draw the ace of clubs 52 times.
       */
      it("puts each of the 52 cards in its own cell", () => {
        const seen = new Set<string>();
        for (let card = 0; card < DECK_SIZE; card++) {
          const box = cardBox(deck, card);
          assert.equal(box.w, deck.grid.w);
          assert.equal(box.h, deck.grid.h);
          assert.ok(box.w > 0 && box.h > 0, `${cardName(card)} has no size`);
          // The French sheet draws all 52 in one place on purpose.
          if (deck.grid.dx !== 0) {
            const cell = `${box.x},${box.y}`;
            assert.ok(!seen.has(cell), `${cardName(card)} shares a cell`);
            seen.add(cell);
          }
        }
        const aspect = deck.grid.w / deck.grid.h;
        assert.ok(
          aspect > 0.55 && aspect < 0.85,
          `a card of ${deck.grid.w} × ${deck.grid.h} is not a card shape`,
        );
      });

      it("ships a preview, and says what it weighs", () => {
        const preview = `public/decks/${deck.id}/preview.webp`;
        assert.ok(exists(preview), `${preview} is missing`);

        // The gallery tells a player what a deck costs before they pay it, so
        // the number has to be the number. Regenerate a sprite without
        // updating `bytes` and this is what says so.
        const actual = gzipSync(
          readFileSync(new URL(`../../${file}`, import.meta.url)),
          { level: 9 },
        ).length;
        const drift = Math.abs(actual - deck.bytes) / actual;
        assert.ok(
          drift < 0.02,
          `${deck.id} says ${deck.bytes} bytes and is ${actual}`,
        );
      });

      it("is on the credits page, by being in this registry", () => {
        // /credits is generated from SOURCED, so this is really an assertion
        // that the credit is complete enough to render.
        assert.ok(deck.credit.name.length > 0);
        assert.ok(deck.credit.authors.length > 0);
        assert.ok(deck.credit.licence.length > 0);
        assert.match(deck.credit.source, /^https?:\/\//);
      });
    });
  }

  /**
   * The gallery is generated from `DECKS`, which is also what storage is
   * validated against — so a deck added to that list and forgotten everywhere
   * else would appear as a tile with no name and no description rather than
   * not at all.
   */
  describe("the catalogue", () => {
    it("has an entry for every deck there is, and no others", () => {
      assert.deepEqual(
        CATALOGUE.map((entry) => entry.id),
        [...DECKS],
      );
    });

    it("names and describes every one of them", () => {
      for (const entry of CATALOGUE) {
        assert.notEqual(entry.name, entry.id, `${entry.id} has no name`);
        assert.ok(entry.blurb.length > 10, `${entry.id} has no description`);
      }
    });

    it("prices the ones that cost something, and only those", () => {
      for (const entry of CATALOGUE) {
        if (entry.sourced === null) {
          assert.equal(entry.bytes, null, `${entry.id} is ours and has a size`);
        } else {
          assert.equal(entry.bytes, entry.sourced.bytes);
        }
      }
    });

    it("says a size the way a person would", () => {
      // Whole kilobytes where the difference does not matter, one decimal
      // where it does: 3.5KB and 5.4KB are different decisions, 126 and 127
      // are not.
      assert.equal(wireSize(3581), "3.5 KB");
      assert.equal(wireSize(128885), "126 KB");
    });
  });

  it("credits the decks we drew as well as the ones we didn't", () => {
    // docs/04: every deck gets an entry whether its licence demands one or not.
    const named = OURS.map((credit) => credit.name).join(" ");
    for (const deck of ["Minimal", "High contrast", "Four colour"]) {
      assert.ok(named.includes(deck), `${deck} is not credited`);
    }
  });
});

/**
 * A deck's shape is now load-bearing: `deckAspect` feeds `metricsFor`, so a
 * typo in a committed cell no longer draws a slightly wrong card, it lays the
 * whole board out wrong. Whether a cell points at the right part of the sheet
 * needs a browser and is `scripts/deck-geometry.ts --verify`'s job; whether the
 * number it yields is a card at all is arithmetic, and belongs here.
 */
describe("every deck is a card shape", () => {
  // Real playing cards run from about 1 : 1.35 (bridge and poker patterns) to
  // 1 : 1.6 (the tall French patterns). Anything outside that is a mistyped
  // cell rather than an unusual deck.
  const SHORTEST = 1.3;
  const TALLEST = 1.6;

  for (const deck of SOURCED) {
    it(`${deck.name} is between ${SHORTEST} and ${TALLEST} times as tall as it is wide`, () => {
      const aspect = deckAspect(deck);
      assert.ok(
        aspect >= SHORTEST && aspect <= TALLEST,
        `${deck.id} is ${aspect.toFixed(3)}, from a ${deck.grid.w}×${deck.grid.h} cell`,
      );
    });
  }

  it("reads the shape off the committed cell and nowhere else", () => {
    for (const deck of SOURCED) {
      assert.equal(deckAspect(deck), deck.grid.h / deck.grid.w);
    }
  });
});
