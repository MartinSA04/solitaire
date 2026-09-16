import {
  type Card,
  type Column,
  type GameState,
  type Move,
  isLegal,
  suitOf,
} from "../engine/index.ts";
import { type Hit, type PileRef, pileCards } from "./Layout.ts";

/**
 * What a drag picks up, and what putting it down means. Pure, so the pointer
 * code in `Drag.ts` is only ever about pointers.
 */

export interface Grab {
  from: PileRef;
  /** Bottom card first — the order they sit in the pile and on screen. */
  cards: Card[];
}

/**
 * Pick up the card under the pointer and everything above it. A tableau
 * column's face-up part is always a properly sequenced run in any reachable
 * position, so "everything above it" needs no further test; the engine
 * re-checks anyway when the move is played.
 *
 * The stock is not draggable: it has exactly one gesture and that gesture is a
 * tap.
 */
export function grab(state: GameState, hit: Hit): Grab | null {
  if (hit.ref.pile === "stock" || hit.index < 0) return null;

  const pile = pileCards(state, hit.ref);
  if (hit.ref.pile === "tableau") {
    const column = state.tableau[hit.ref.column] as Column;
    if (hit.index < column.down) return null;
  } else if (hit.index !== pile.length - 1) {
    // Only the top of the waste or a foundation is ever in play.
    return null;
  }

  return { from: hit.ref, cards: pile.slice(hit.index) };
}

/**
 * The move a drop means, or `null` if it doesn't mean a legal one — in which
 * case the stack springs back to where it came from.
 */
export function dropMove(
  state: GameState,
  held: Grab,
  onto: PileRef,
): Move | null {
  const move = intent(held, onto);
  return move !== null && isLegal(state, move) ? move : null;
}

function intent(held: Grab, onto: PileRef): Move | null {
  const count = held.cards.length;
  const bottom = held.cards[0] as Card;

  // A foundation takes one card at a time, and only its own suit.
  if (onto.pile === "foundation") {
    if (count !== 1 || onto.suit !== suitOf(bottom)) return null;
    if (held.from.pile === "waste") return { kind: "wasteToFoundation" };
    if (held.from.pile === "tableau") {
      return { kind: "tableauToFoundation", from: held.from.column };
    }
    return null;
  }

  if (onto.pile !== "tableau") return null;

  switch (held.from.pile) {
    case "waste":
      return { kind: "wasteToTableau", to: onto.column };
    case "foundation":
      return {
        kind: "foundationToTableau",
        suit: held.from.suit,
        to: onto.column,
      };
    case "tableau":
      return {
        kind: "tableauToTableau",
        from: held.from.column,
        to: onto.column,
        count,
      };
    default:
      return null;
  }
}
