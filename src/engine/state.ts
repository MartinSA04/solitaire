import { type Card, RANK_COUNT, SUIT_COUNT } from "./card.ts";

export const TABLEAU_COLUMNS = 7;

/** Draw one card from the stock, or three. Chosen in settings; frozen for a deal. */
export type DrawCount = 1 | 3;

/**
 * A tableau column. `down` is how many of the *leading* cards are face down;
 * everything after them is face up. `down <= cards.length` always, and
 * `down < cards.length` whenever the column is non-empty, because the top card
 * turns over the moment it is exposed.
 */
export type Column = {
  cards: Card[];
  down: number;
};

export type GameState = {
  /** Face down. Index 0 is the next card to be drawn. */
  stock: Card[];
  /** Face up. The last element is the top, and the only playable one. */
  waste: Card[];
  /** Four piles indexed by suit, ascending A→K with no gaps. */
  foundations: Card[][];
  /** Seven columns, bottom → top. */
  tableau: Column[];
  drawCount: DrawCount;
  /** The deal number this state descends from. */
  seed: number;
  /**
   * How many moves produced this state. Undo restores the state and therefore
   * this number; the player-facing move *count* is monotonic and lives on
   * `Game.movesPlayed`, because undo is forgiveness, not a way to cheat the
   * counter down. See docs/02-game-spec.md.
   */
  moves: number;
};

export function topOf<T>(pile: readonly T[]): T | undefined {
  return pile[pile.length - 1];
}

/** How many of a column's cards are face up. */
export function faceUpCount(column: Column): number {
  return column.cards.length - column.down;
}

export function isColumnIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < TABLEAU_COLUMNS;
}

export function isSuitIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < SUIT_COUNT;
}

/** All 52 cards on the foundations. The only win condition there is. */
export function isWon(state: GameState): boolean {
  return state.foundations.every((pile) => pile.length === RANK_COUNT);
}

/**
 * Every card face up in the tableau: none face down, and nothing left in the
 * stock or the waste. This is what puts the Finish button on screen.
 *
 * At that point the deal is already won and the player is only owed the
 * ceremony, and it is a proof rather than a strong hunch. Every column is a
 * descending run, so the lowest-ranked card still needed is always the top of
 * one of them — sending cards home in rank order cannot get stuck.
 *
 * The empty stock is doing real work in that argument. "No face-down cards"
 * alone is not enough: in draw-3 a card you need can sit in the waste under
 * one that has nowhere to go, in a rotation that never exposes it, and a
 * Finish button that sometimes stops halfway is worse than none.
 */
export function canAutoComplete(state: GameState): boolean {
  return (
    !isWon(state) &&
    state.stock.length === 0 &&
    state.waste.length === 0 &&
    state.tableau.every((column) => column.down === 0)
  );
}

/**
 * The whole turnover rule, in the one place it is allowed to live: a move that
 * strips a column back to nothing but face-down cards flips the new top card.
 * It is part of the move that exposed it, not a move of its own — which is
 * what makes undo restore face-down-ness correctly.
 */
export function turnOver(column: Column): Column {
  return column.cards.length > 0 && column.down === column.cards.length
    ? { cards: column.cards, down: column.down - 1 }
    : column;
}
