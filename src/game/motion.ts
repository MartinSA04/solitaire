import {
  type Card,
  type Column,
  type GameState,
  type Move,
  SUIT_COUNT,
  TABLEAU_COLUMNS,
  suitOf,
  topOf,
} from "../engine/index.ts";

/**
 * The two things the move catalogue needs that the engine has no reason to
 * know: what a board looked like *before* it was dealt, and which cards a
 * given move set in motion.
 *
 * Both are pure, and both are presentation rather than rules — a deal happens
 * atomically as far as `src/engine/` is concerned, and the fact that it is
 * shown as twenty-eight cards leaving a pile one after another is a decision
 * of docs/05-interaction-and-motion.md's, not of docs/03's.
 */

/**
 * The order the tableau was dealt: one card to every column still in play,
 * then again skipping the first, and so on. It is `deal()`'s loop read back
 * off the finished board, and it is what the deal stagger runs along — a
 * stagger in any other order reads as cards being *drawn*, not dealt.
 *
 * Only meaningful on a freshly dealt board. On a played one it returns
 * whatever happens to be sitting in those positions, which is harmless: it is
 * only ever asked at the moment a deal is put on screen.
 */
export function dealOrder(state: GameState): Card[] {
  const order: Card[] = [];
  for (let row = 0; row < TABLEAU_COLUMNS; row++) {
    for (let column = row; column < TABLEAU_COLUMNS; column++) {
      const card = state.tableau[column]?.cards[row];
      if (card !== undefined) order.push(card);
    }
  }
  return order;
}

/**
 * The same deal with every card still in the dealer's hand: fifty-two on the
 * stock, face down, nothing anywhere else.
 *
 * This is a *display* state and never reaches the engine. Rendering it and
 * then rendering the real one is the whole of the deal animation — the cards
 * fly from the stock because that is genuinely where they were a frame ago,
 * with no flying layer and nothing to measure. The same trick as `?win`'s
 * staged board, pointed the other way.
 */
export function predealt(state: GameState): GameState {
  return {
    ...state,
    stock: [
      ...dealOrder(state),
      ...state.waste,
      ...state.foundations.flat(),
      ...state.stock,
    ],
    waste: [],
    foundations: Array.from({ length: SUIT_COUNT }, (): Card[] => []),
    tableau: Array.from({ length: TABLEAU_COLUMNS }, () => ({
      cards: [],
      down: 0,
    })),
  };
}

/**
 * The card a move is about to send to a foundation, if it is sending one —
 * asked of the position *before* the move, because that is where the card
 * still is. It decides which of the two sounds a move makes: going home is
 * the one arrival in the game that is worth its own note.
 */
export function homedCard(state: GameState, move: Move): Card | null {
  switch (move.kind) {
    case "wasteToFoundation":
      return topOf(state.waste) ?? null;
    case "tableauToFoundation":
      return topOf((state.tableau[move.from] as Column).cards) ?? null;
    default:
      return null;
  }
}

/**
 * The cards a draw turned over, oldest first — one in draw-1, up to three in
 * draw-3, and fewer than three when the stock is nearly spent. They are the
 * order the draw-3 fan staggers along; the fan is what makes draw-3 readable.
 */
export function drawnCards(before: GameState, after: GameState): Card[] {
  const turned = after.waste.length - before.waste.length;
  return turned > 0 ? after.waste.slice(after.waste.length - turned) : [];
}

/**
 * The cards a hint should point at: the one to move, and the one to move it
 * onto. Both pulse together, which is what makes a hint a *move* rather than
 * a card with an outline round it.
 *
 * Empty destinations have no card to pulse — an empty column, an empty
 * foundation, a spent stock — so a hint at one of those pulses only its
 * source, and the player reads the rest from the board. Highlighting the slot
 * instead would mean the card layer knowing about the slot grid, which is the
 * one thing docs/07 keeps it out of.
 *
 * Asked of the position *before* the move, because that is where the cards
 * still are.
 */
export function hintCards(state: GameState, move: Move): Card[] {
  const cards: Card[] = [];
  const push = (card: Card | undefined): void => {
    if (card !== undefined) cards.push(card);
  };
  const columnTop = (index: number): Card | undefined =>
    topOf((state.tableau[index] as Column).cards);

  switch (move.kind) {
    // The stock, and the card that is next off it: the top of the face-down
    // pile is the card the player taps.
    case "draw":
      push(state.stock[0]);
      break;
    // Nothing is face up to point at, so the waste going back is the hint.
    case "recycle":
      push(state.waste[0]);
      break;
    case "wasteToFoundation":
      push(topOf(state.waste));
      push(topOf(state.foundations[suitOf(topOf(state.waste) ?? 0)] as Card[]));
      break;
    case "wasteToTableau":
      push(topOf(state.waste));
      push(columnTop(move.to));
      break;
    case "tableauToFoundation": {
      const card = columnTop(move.from);
      push(card);
      if (card !== undefined) {
        push(topOf(state.foundations[suitOf(card)] as Card[]));
      }
      break;
    }
    case "tableauToTableau": {
      const column = state.tableau[move.from] as Column;
      push(column.cards[column.cards.length - move.count]);
      push(columnTop(move.to));
      break;
    }
    case "foundationToTableau":
      push(topOf(state.foundations[move.suit] as Card[]));
      push(columnTop(move.to));
      break;
  }
  return cards;
}
