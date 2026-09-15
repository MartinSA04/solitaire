import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DECK_SIZE } from "../../src/engine/card.ts";
import { mulberry32, shuffledDeck } from "../../src/engine/rng.ts";

/**
 * The PRNG is frozen forever: deal numbers are shared between players, saved
 * games are a seed plus a move list, and personal bests are keyed by seed. If
 * anything here fails, the change is wrong, not the test.
 */

const GOLDEN: Array<[seed: number, first: number[]]> = [
  [0, [1144304738, 1416247, 958946056, 627933444, 2007157716, 2340967985]],
  [1, [2693262067, 11749833, 2265367787, 4213581821, 4159151403, 1207330352]],
  [42, [2581720956, 1925393290, 3661312704, 2876485805, 750819978, 2261697747]],
  [
    0xffffffff,
    [3850105811, 813802916, 3073704848, 4054706436, 3630262831, 2315588663],
  ],
];

/**
 * mulberry32 exactly as published, in its usual float form. Kept here as an
 * independent witness: it pins us to the *algorithm*, not merely to whatever
 * our own implementation happened to produce the day it was written.
 */
function canonicalMulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("mulberry32", () => {
  it("produces the pinned stream for known seeds", () => {
    for (const [seed, first] of GOLDEN) {
      const next = mulberry32(seed);
      assert.deepEqual(
        first.map(() => next()),
        first,
        `seed ${seed}`,
      );
    }
  });

  it("is the published algorithm, scaled to uint32", () => {
    for (const [seed] of GOLDEN) {
      const ours = mulberry32(seed);
      const published = canonicalMulberry32(seed);
      for (let i = 0; i < 200; i++) {
        assert.equal(
          ours() / 4294967296,
          published(),
          `seed ${seed}, draw ${i}`,
        );
      }
    }
  });

  it("yields uint32 values, because the shuffle takes a modulo of them", () => {
    const next = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      assert.ok(Number.isInteger(value), `${value} is not an integer`);
      assert.ok(value >= 0 && value <= 0xffffffff, `${value} is out of range`);
    }
  });

  it("treats the seed as a uint32", () => {
    assert.deepEqual(mulberry32(-1)(), mulberry32(0xffffffff)());
  });
});

describe("shuffle", () => {
  it("is a permutation of the whole deck", () => {
    for (const seed of [0, 1, 7, 99, 123456, 0xffffffff]) {
      const deck = shuffledDeck(seed);
      assert.equal(deck.length, DECK_SIZE);
      assert.deepEqual(
        [...deck].sort((a, b) => a - b),
        Array.from({ length: DECK_SIZE }, (_, i) => i),
        `seed ${seed}`,
      );
    }
  });

  it("is a pure function of the seed", () => {
    assert.deepEqual(shuffledDeck(4811209), shuffledDeck(4811209));
  });

  it("gives adjacent seeds unrelated decks", () => {
    const a = shuffledDeck(1000);
    const b = shuffledDeck(1001);
    const samePosition = a.filter((card, i) => card === b[i]).length;
    assert.ok(samePosition < 10, `${samePosition} cards did not move`);
  });
});
