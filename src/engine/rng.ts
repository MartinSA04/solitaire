import { type Card, DECK_SIZE, cardAt, orderedDeck } from "./card.ts";

/**
 * mulberry32, the frozen PRNG.
 *
 * Chosen because it is eleven lines, has no dependencies, and is trivial to
 * reimplement identically if this project is ever rewritten in another
 * language. We need 2³² distinguishable shuffles, not cryptography, so quality
 * beyond "passes smallcrush" is irrelevant.
 *
 * It yields **uint32** values rather than the more common float in `[0, 1)`,
 * because the shuffle below takes `next() % (i + 1)` and a modulo of a float is
 * not a shuffle.
 *
 * Frozen forever. test/engine/rng.test.ts pins its output.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/**
 * Fisher–Yates over `[0..51]`, running **backwards from index 51** and taking
 * `j = next() % (i + 1)`. The modulo bias is real and irrelevant at this scale;
 * what matters is that the exact procedure is written down, because it can
 * never change. See the invariant in deal.ts.
 */
export function shuffledDeck(seed: number): Card[] {
  const deck = orderedDeck();
  const next = mulberry32(seed);
  for (let i = DECK_SIZE - 1; i > 0; i--) {
    const j = next() % (i + 1);
    const swap = cardAt(deck, i);
    deck[i] = cardAt(deck, j);
    deck[j] = swap;
  }
  return deck;
}
