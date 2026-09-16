import {
  type Card,
  type GameState,
  SUIT_COUNT,
  TABLEAU_COLUMNS,
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
 * The cards a draw turned over, oldest first — one in draw-1, up to three in
 * draw-3, and fewer than three when the stock is nearly spent. They are the
 * order the draw-3 fan staggers along; the fan is what makes draw-3 readable.
 */
export function drawnCards(before: GameState, after: GameState): Card[] {
  const turned = after.waste.length - before.waste.length;
  return turned > 0 ? after.waste.slice(after.waste.length - turned) : [];
}
