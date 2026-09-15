import { type Card, cardAt } from "./card.ts";
import { shuffledDeck } from "./rng.ts";
import {
  type Column,
  type DrawCount,
  type GameState,
  TABLEAU_COLUMNS,
} from "./state.ts";

/** Twenty-eight cards to the tableau, twenty-four to the stock. */
export const TABLEAU_CARDS = 28;
export const STOCK_CARDS = 24;

export const MAX_SEED = 0xffffffff;

export function isSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED;
}

/**
 * Deal number → deal.
 *
 * ```text
 * seed → mulberry32(seed) → Fisher–Yates over [0..51]
 *      → deck[0..27] dealt a row at a time across the seven columns
 *      → deck[28..51] to the stock, index 0 next to be drawn
 * ```
 *
 * Cards go into the columns the way they are dealt by hand: one to every
 * column still in play, then again skipping the first, and so on — so column
 * *n* ends up with *n + 1* cards, of which the last one dealt is face up.
 *
 * > **The mapping from deal number to deal is frozen at first release and can
 * > never change.** Not the PRNG, not the direction of the shuffle, not the
 * > modulo, not the order cards land in the columns.
 *
 * Players share deal numbers, personal bests are keyed by deal number, and a
 * saved game is a seed plus a move list. A changed shuffle silently
 * invalidates all three. test/engine/deal.test.ts pins full layouts for a
 * fixed set of seeds; if it fails, the change is wrong, not the test. A
 * genuinely different generator ships as a *named second* generator, it does
 * not replace this one.
 */
export function deal(seed: number, drawCount: DrawCount): GameState {
  if (!isSeed(seed)) {
    throw new RangeError(`deal number must be a uint32, got ${seed}`);
  }

  const deck = shuffledDeck(seed);
  const tableau: Column[] = Array.from({ length: TABLEAU_COLUMNS }, (_, n) => ({
    cards: [],
    down: n,
  }));

  let dealt = 0;
  for (let row = 0; row < TABLEAU_COLUMNS; row++) {
    for (let column = row; column < TABLEAU_COLUMNS; column++) {
      (tableau[column] as Column).cards.push(cardAt(deck, dealt++));
    }
  }

  const stock: Card[] = deck.slice(TABLEAU_CARDS);

  return {
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    drawCount,
    seed,
    moves: 0,
  };
}
