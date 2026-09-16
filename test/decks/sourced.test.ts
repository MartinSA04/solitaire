import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DECK_SIZE, cardName } from "../../src/engine/index.ts";
import { OURS, SOURCED } from "../../src/decks/sourced.ts";

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

  it("credits the decks we drew as well as the ones we didn't", () => {
    // docs/04: every deck gets an entry whether its licence demands one or not.
    const named = OURS.map((credit) => credit.name).join(" ");
    for (const deck of ["Minimal", "High contrast", "Four colour"]) {
      assert.ok(named.includes(deck), `${deck} is not credited`);
    }
  });
});
