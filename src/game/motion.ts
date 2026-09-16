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
import { type PileRef } from "./Layout.ts";

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
 * What a hint points at: **the cards that can move, and the pile they can move
 * into.** Two marks, because either on its own is half a sentence — a card
 * with a ring round it does not say where it is going, and a lit-up column
 * does not say what belongs in it.
 *
 * The destination is a pile rather than a card, which is the part that changed:
 * an empty column, an empty foundation and a spent stock are exactly the
 * destinations a hint is most useful about, and they have no card on them to
 * mark. The board lights the slot in those cases and the top card in the
 * others, and the card layer is still told nothing about the slot grid — it is
 * given cards, and the thirteen slot elements are the chrome's, which is where
 * docs/07 already keeps them.
 *
 * Asked of the position *before* the move, because that is where the cards
 * still are.
 */
export interface Hinted {
  /** The cards that would move, bottom of the run first. */
  cards: Card[];
  /** The pile they would move onto. */
  to: PileRef;
}

export function hintOf(state: GameState, move: Move): Hinted {
  const columnTop = (index: number): Card[] => {
    const card = topOf((state.tableau[index] as Column).cards);
    return card === undefined ? [] : [card];
  };
  const wasteTop = (): Card[] => {
    const card = topOf(state.waste);
    return card === undefined ? [] : [card];
  };

  switch (move.kind) {
    // The card that is next off the stock, and the pile it is turned onto.
    case "draw":
      return {
        cards: state.stock[0] === undefined ? [] : [state.stock[0]],
        to: { pile: "waste" },
      };
    // The waste going back under the stock: the one card of it you can see.
    case "recycle":
      return { cards: wasteTop(), to: { pile: "stock" } };
    case "wasteToFoundation": {
      const card = topOf(state.waste);
      return {
        cards: wasteTop(),
        to: { pile: "foundation", suit: suitOf(card ?? 0) },
      };
    }
    case "wasteToTableau":
      return { cards: wasteTop(), to: { pile: "tableau", column: move.to } };
    case "tableauToFoundation": {
      const cards = columnTop(move.from);
      return {
        cards,
        to: { pile: "foundation", suit: suitOf(cards[0] ?? 0) },
      };
    }
    // The whole run, not just the card at the bottom of it: what is being
    // pointed at is the thing that would move.
    case "tableauToTableau": {
      const column = state.tableau[move.from] as Column;
      return {
        cards: column.cards.slice(column.cards.length - move.count),
        to: { pile: "tableau", column: move.to },
      };
    }
    case "foundationToTableau": {
      const card = topOf(state.foundations[move.suit] as Card[]);
      return {
        cards: card === undefined ? [] : [card],
        to: { pile: "tableau", column: move.to },
      };
    }
  }
}
