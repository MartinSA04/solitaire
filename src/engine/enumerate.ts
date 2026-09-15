import { type Card, type Suit, SUIT_COUNT, canStack, cardAt } from "./card.ts";
import { type Move, canPlaceOnFoundation, canPlaceOnTableau } from "./moves.ts";
import {
  type Column,
  type GameState,
  TABLEAU_COLUMNS,
  faceUpCount,
  topOf,
} from "./state.ts";

/**
 * Every legal move from a state, in a fixed order:
 *
 * 1. tableau → foundation, by column
 * 2. waste → foundation
 * 3. tableau → tableau, by source column then run length then destination
 * 4. waste → tableau
 * 5. foundation → tableau
 * 6. draw
 * 7. recycle
 *
 * The order only has to be *deterministic* — it is what makes a solver run
 * reproducible. All three consumers re-sort it for their own purposes: hints
 * rank it, auto-complete filters it, the solver orders it for search.
 *
 * It deliberately includes moves no player would ever want, such as pulling a
 * card back off a foundation, because the solver needs them to exist. Note
 * that a run which can go to two different columns yields two distinct moves;
 * deduplicating those is the caller's job, and is done by resulting-state hash
 * rather than by move.
 */
export function legalMoves(state: GameState): Move[] {
  const moves: Move[] = [];

  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    const column = state.tableau[from] as Column;
    if (faceUpCount(column) < 1) continue;
    const card = cardAt(column.cards, column.cards.length - 1);
    if (canPlaceOnFoundation(card, state.foundations)) {
      moves.push({ kind: "tableauToFoundation", from });
    }
  }

  const wasteTop = topOf(state.waste);
  if (
    wasteTop !== undefined &&
    canPlaceOnFoundation(wasteTop, state.foundations)
  ) {
    moves.push({ kind: "wasteToFoundation" });
  }

  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    const column = state.tableau[from] as Column;
    const available = faceUpCount(column);
    for (let count = 1; count <= available; count++) {
      const start = column.cards.length - count;
      // Once a pair breaks the sequence, every longer run from this column
      // contains that same pair, so nothing further can move.
      if (
        count > 1 &&
        !canStack(cardAt(column.cards, start + 1), cardAt(column.cards, start))
      ) {
        break;
      }
      const head = cardAt(column.cards, start);
      for (let to = 0; to < TABLEAU_COLUMNS; to++) {
        if (to === from) continue;
        if (canPlaceOnTableau(head, state.tableau[to] as Column)) {
          moves.push({ kind: "tableauToTableau", from, to, count });
        }
      }
    }
  }

  if (wasteTop !== undefined) {
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      if (canPlaceOnTableau(wasteTop, state.tableau[to] as Column)) {
        moves.push({ kind: "wasteToTableau", to });
      }
    }
  }

  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    const card = topOf(state.foundations[suit] as Card[]);
    if (card === undefined) continue;
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      if (canPlaceOnTableau(card, state.tableau[to] as Column)) {
        moves.push({ kind: "foundationToTableau", suit: suit as Suit, to });
      }
    }
  }

  if (state.stock.length > 0) moves.push({ kind: "draw" });
  else if (state.waste.length > 0) moves.push({ kind: "recycle" });

  return moves;
}

/**
 * Does the move expose a face-down card? This is what progress looks like in
 * Klondike — it is the top of the hint ranking and the natural first key for
 * solver move ordering.
 */
export function turnsOverCard(state: GameState, move: Move): boolean {
  if (move.kind === "tableauToFoundation") {
    const column = state.tableau[move.from] as Column;
    return column.down > 0 && faceUpCount(column) === 1;
  }
  if (move.kind === "tableauToTableau") {
    const column = state.tableau[move.from] as Column;
    return column.down > 0 && move.count === faceUpCount(column);
  }
  return false;
}

/** Does the move leave its source column empty? */
export function emptiesColumn(state: GameState, move: Move): boolean {
  if (move.kind === "tableauToFoundation") {
    const column = state.tableau[move.from] as Column;
    return column.down === 0 && column.cards.length === 1;
  }
  if (move.kind === "tableauToTableau") {
    const column = state.tableau[move.from] as Column;
    return column.down === 0 && move.count === column.cards.length;
  }
  return false;
}

/**
 * Moving a whole column into an empty one: legal, and completely pointless —
 * it relabels which column the hole is in and changes nothing else. Worth
 * naming because it is an infinite loop for a search and a nonsense hint.
 */
export function isHoleShuffle(state: GameState, move: Move): boolean {
  return (
    move.kind === "tableauToTableau" &&
    emptiesColumn(state, move) &&
    (state.tableau[move.to] as Column).cards.length === 0
  );
}
