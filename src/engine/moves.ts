import {
  type Card,
  type Suit,
  KING,
  canStack,
  cardAt,
  rankOf,
  suitOf,
} from "./card.ts";
import {
  type Column,
  type GameState,
  faceUpCount,
  isColumnIndex,
  isSuitIndex,
  topOf,
  turnOver,
} from "./state.ts";

/**
 * A move names a *source pile and a count*, never a card. That makes it
 * unambiguous, compact enough to store a whole game as a list of them, and
 * validatable without searching the board for a card.
 *
 * `count` on `tableauToTableau` is how many cards are taken from the top of
 * `from` — a properly sequenced run of any length moves as a unit, and a
 * partial run may be taken from anywhere within a sequence.
 */
export type Move =
  | { kind: "draw" }
  | { kind: "recycle" }
  | { kind: "wasteToTableau"; to: number }
  | { kind: "wasteToFoundation" }
  | { kind: "tableauToTableau"; from: number; to: number; count: number }
  | { kind: "tableauToFoundation"; from: number }
  | { kind: "foundationToTableau"; suit: Suit; to: number };

export class IllegalMoveError extends Error {
  constructor(move: Move) {
    super(`illegal move: ${encodeMove(move)}`);
    this.name = "IllegalMoveError";
  }
}

/** Only a King, or a run headed by one, may be placed in an empty column. */
export function canPlaceOnTableau(card: Card, column: Column): boolean {
  const top = topOf(column.cards);
  return top === undefined ? rankOf(card) === KING : canStack(card, top);
}

/**
 * Foundations build up in suit from the Ace with no gaps, so the pile's length
 * *is* the rank it wants next.
 */
export function canPlaceOnFoundation(
  card: Card,
  foundations: readonly Card[][],
): boolean {
  return (foundations[suitOf(card)] as Card[]).length === rankOf(card);
}

/** Is `cards[from..]` a descending, alternating-colour run? */
export function isSequenced(cards: readonly Card[], from: number): boolean {
  for (let i = from; i < cards.length - 1; i++) {
    if (!canStack(cardAt(cards, i + 1), cardAt(cards, i))) return false;
  }
  return true;
}

export function isLegal(state: GameState, move: Move): boolean {
  switch (move.kind) {
    case "draw":
      return state.stock.length > 0;

    // Only once the stock is exhausted, and never as a no-op on an empty
    // waste. Unlimited otherwise: with no score, capping redeals would only
    // mean "you may no longer press this button".
    case "recycle":
      return state.stock.length === 0 && state.waste.length > 0;

    case "wasteToTableau": {
      const card = topOf(state.waste);
      if (card === undefined || !isColumnIndex(move.to)) return false;
      return canPlaceOnTableau(card, state.tableau[move.to] as Column);
    }

    case "wasteToFoundation": {
      const card = topOf(state.waste);
      return (
        card !== undefined && canPlaceOnFoundation(card, state.foundations)
      );
    }

    case "tableauToTableau": {
      if (!isColumnIndex(move.from) || !isColumnIndex(move.to)) return false;
      if (move.from === move.to) return false;
      if (!Number.isInteger(move.count) || move.count < 1) return false;
      const from = state.tableau[move.from] as Column;
      // Face-down cards are not yours to move, and neither is a run that isn't
      // properly sequenced all the way down.
      if (move.count > faceUpCount(from)) return false;
      const start = from.cards.length - move.count;
      if (!isSequenced(from.cards, start)) return false;
      return canPlaceOnTableau(
        cardAt(from.cards, start),
        state.tableau[move.to] as Column,
      );
    }

    case "tableauToFoundation": {
      if (!isColumnIndex(move.from)) return false;
      const from = state.tableau[move.from] as Column;
      if (faceUpCount(from) < 1) return false;
      return canPlaceOnFoundation(
        cardAt(from.cards, from.cards.length - 1),
        state.foundations,
      );
    }

    // Cards may come back off a foundation. It exists in the physical game, it
    // is occasionally necessary to win, and forbidding it only creates a trap.
    case "foundationToTableau": {
      if (!isSuitIndex(move.suit) || !isColumnIndex(move.to)) return false;
      const card = topOf(state.foundations[move.suit] as Card[]);
      if (card === undefined) return false;
      return canPlaceOnTableau(card, state.tableau[move.to] as Column);
    }
  }
}

/**
 * Apply a legal move, returning a new state. Throws on an illegal one — the UI
 * speculates through `Game.play`, which checks first and never throws.
 *
 * The piles the move didn't touch are shared with the previous state, which is
 * what makes a full-snapshot undo history cheap. Nothing here mutates an
 * existing pile.
 */
export function applyMove(state: GameState, move: Move): GameState {
  if (!isLegal(state, move)) throw new IllegalMoveError(move);

  const next: GameState = { ...state, moves: state.moves + 1 };

  switch (move.kind) {
    case "draw": {
      const count = Math.min(state.drawCount, state.stock.length);
      next.stock = state.stock.slice(count);
      next.waste = state.waste.concat(state.stock.slice(0, count));
      break;
    }

    // In order, face down: the stock's sequence is fixed at deal time and a
    // redeal never reshuffles it. That is what makes draw-3 a game of counting
    // rather than of luck twice over.
    case "recycle": {
      next.stock = state.waste.slice();
      next.waste = [];
      break;
    }

    case "wasteToTableau": {
      const card = cardAt(state.waste, state.waste.length - 1);
      next.waste = state.waste.slice(0, -1);
      next.tableau = withColumn(state.tableau, move.to, (column) => ({
        cards: column.cards.concat(card),
        down: column.down,
      }));
      break;
    }

    case "wasteToFoundation": {
      const card = cardAt(state.waste, state.waste.length - 1);
      next.waste = state.waste.slice(0, -1);
      next.foundations = withFoundation(
        state.foundations,
        suitOf(card),
        (pile) => pile.concat(card),
      );
      break;
    }

    case "tableauToTableau": {
      const from = state.tableau[move.from] as Column;
      const start = from.cards.length - move.count;
      const run = from.cards.slice(start);
      const tableau = state.tableau.slice();
      tableau[move.from] = turnOver({
        cards: from.cards.slice(0, start),
        down: from.down,
      });
      const to = tableau[move.to] as Column;
      tableau[move.to] = { cards: to.cards.concat(run), down: to.down };
      next.tableau = tableau;
      break;
    }

    case "tableauToFoundation": {
      const from = state.tableau[move.from] as Column;
      const card = cardAt(from.cards, from.cards.length - 1);
      next.tableau = withColumn(state.tableau, move.from, (column) =>
        turnOver({ cards: column.cards.slice(0, -1), down: column.down }),
      );
      next.foundations = withFoundation(
        state.foundations,
        suitOf(card),
        (pile) => pile.concat(card),
      );
      break;
    }

    case "foundationToTableau": {
      const card = cardAt(
        state.foundations[move.suit] as Card[],
        (state.foundations[move.suit] as Card[]).length - 1,
      );
      next.foundations = withFoundation(state.foundations, move.suit, (pile) =>
        pile.slice(0, -1),
      );
      next.tableau = withColumn(state.tableau, move.to, (column) => ({
        cards: column.cards.concat(card),
        down: column.down,
      }));
      break;
    }
  }

  return next;
}

function withColumn(
  tableau: readonly Column[],
  index: number,
  replace: (column: Column) => Column,
): Column[] {
  const next = tableau.slice();
  next[index] = replace(tableau[index] as Column);
  return next;
}

function withFoundation(
  foundations: readonly Card[][],
  suit: Suit,
  replace: (pile: Card[]) => Card[],
): Card[][] {
  const next = foundations.slice();
  next[suit] = replace(foundations[suit] as Card[]);
  return next;
}

/**
 * A move as a short token, for saved games and debugging. A 300-move game is
 * about 1.5KB of these, which is what makes "seed plus move list" a viable
 * save format — see docs/07-architecture.md.
 */
export function encodeMove(move: Move): string {
  switch (move.kind) {
    case "draw":
      return "d";
    case "recycle":
      return "r";
    case "wasteToFoundation":
      return "wf";
    case "wasteToTableau":
      return `wt${move.to}`;
    case "tableauToFoundation":
      return `t${move.from}f`;
    case "tableauToTableau":
      return `t${move.from}t${move.to}x${move.count}`;
    case "foundationToTableau":
      return `f${move.suit}t${move.to}`;
  }
}

/** The inverse of {@link encodeMove}. `null` for anything unrecognised — a save file is untrusted input. */
export function decodeMove(token: string): Move | null {
  if (token === "d") return { kind: "draw" };
  if (token === "r") return { kind: "recycle" };
  if (token === "wf") return { kind: "wasteToFoundation" };

  const wasteToTableau = /^wt([0-6])$/.exec(token);
  if (wasteToTableau) {
    return { kind: "wasteToTableau", to: Number(wasteToTableau[1]) };
  }

  const tableauToFoundation = /^t([0-6])f$/.exec(token);
  if (tableauToFoundation) {
    return {
      kind: "tableauToFoundation",
      from: Number(tableauToFoundation[1]),
    };
  }

  const tableauToTableau = /^t([0-6])t([0-6])x(1[0-3]|[1-9])$/.exec(token);
  if (tableauToTableau) {
    return {
      kind: "tableauToTableau",
      from: Number(tableauToTableau[1]),
      to: Number(tableauToTableau[2]),
      count: Number(tableauToTableau[3]),
    };
  }

  const foundationToTableau = /^f([0-3])t([0-6])$/.exec(token);
  if (foundationToTableau) {
    return {
      kind: "foundationToTableau",
      suit: Number(foundationToTableau[1]) as Suit,
      to: Number(foundationToTableau[2]),
    };
  }

  return null;
}
