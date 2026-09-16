import {
  type Card,
  type Column,
  type GameState,
  type Move,
  type Suit,
  KING,
  TABLEAU_COLUMNS,
  isLegal,
  rankOf,
  topOf,
} from "../engine/index.ts";
import { type Hit } from "./Layout.ts";

/**
 * Tap-to-auto-move: "do the obvious thing with this card".
 *
 * This is the most important interaction in the game — on a 46px card,
 * dragging is fiddly and tapping is not — and it is *policy*, not rules. It
 * lives here rather than in the engine because it is a guess about what a
 * player wanted, and docs/07-architecture.md flags it as the thing most likely
 * to need tuning once there are fifty games behind it.
 *
 * The ranking is docs/05-interaction-and-motion.md's:
 *
 * 1. A foundation, if legal.
 * 2. A tableau column that turns over a face-down card.
 * 3. A non-empty tableau column.
 * 4. An empty column, for a King that isn't already sitting on nothing.
 * 5. Off a foundation, into a column — a tap on a card that is already home.
 *
 * Three of those need a word.
 *
 * **Rule 1 used to have an "unless".** A legal foundation move was held back
 * while anything in the tableau could still be built on the card — the
 * standard guard against sending a 7♥ up while a black 6 is looking for a
 * home. It is gone, because it made the most-used gesture in the game
 * unpredictable: two taps on two cards that look equally home-able did
 * different things for a reason nothing on screen explains, and the audit
 * below puts a number on how often — 2,671 of the 2,715 taps that went
 * somewhere the player had not asked for were this rule overriding them. A
 * gesture whose first rule is "the obvious thing, unless" is not a gesture
 * anyone can aim. Undo is one tap and the guard's own judgement was never
 * better than a guess.
 *
 * **Rule 2 cannot discriminate between the *targets* of a single tap** —
 * whether a move turns a card over depends entirely on the column it leaves,
 * which is the same for every candidate — so for one tapped card rules 2 and 3
 * collapse into "a column with a card in it, before an empty one".
 *
 * **Rule 5 is the same gesture pointed the other way.** A card can be dragged
 * back off a foundation when a run needs it, and on a phone dragging is the
 * fiddly half of the interface; a tap that shook the card instead was the game
 * refusing a move it has always allowed.
 *
 * Every auto-move is undoable, which is what lets the heuristic be aggressive.
 *
 * `scripts/audit-automove.ts` is what stops the tuning being an argument. It
 * plays a greedy player's games twice, once playing its moves and once tapping
 * the cards those moves name, and it prices the change above over deals 1–200:
 * taps that went somewhere the player had not asked for fell from 2.7% to
 * 0.2%, and the greedy player's win rate fell with them, 53.5% → 48.5% at
 * draw-1 and 16.0% → 14.0% at draw-3.
 *
 * That is the trade the "unless" was making on everybody's behalf, with a
 * number on it. A robot that never presses Undo pays for it; a person who can
 * see the black 6 sitting on the table, and who tapped the 7♥ anyway, should
 * not have to.
 */
export function autoMove(state: GameState, hit: Hit): Move | null {
  switch (hit.ref.pile) {
    // Tapping the stock turns it; tapping the empty stock puts it back.
    case "stock":
      return state.stock.length > 0 ? { kind: "draw" } : { kind: "recycle" };

    case "waste":
      return hit.index === state.waste.length - 1
        ? forSingleCard(state, hit.card as Card, OFF_TABLEAU, wasteMove)
        : null;

    // Home already, so there is no foundation to send it to: the only
    // candidates are the columns.
    case "foundation":
      return fromFoundation(state, hit.ref.suit, hit.index);

    case "tableau":
      return fromTableau(state, hit.ref.column, hit.index);
  }
}

/**
 * The waste or a foundation, as a source column. Not a column, and never equal
 * to one — the only thing that reads it is the lone-King rule, which is about
 * the hole a card leaves behind, and neither of these leaves one.
 */
const OFF_TABLEAU = -1;

/** Builds the move that sends this card to column `to`, or home when `to` is `null`. */
type MoveFor = (to: number | null) => Move;

const wasteMove: MoveFor = (to) =>
  to === null ? { kind: "wasteToFoundation" } : { kind: "wasteToTableau", to };

function fromFoundation(
  state: GameState,
  suit: Suit,
  index: number,
): Move | null {
  const pile = state.foundations[suit] as Card[];
  // Only the top of a foundation is ever in play, and a tap on the empty slot
  // is a tap on nothing.
  if (index !== pile.length - 1) return null;
  const card = topOf(pile);
  if (card === undefined) return null;

  return bestColumn(state, card, OFF_TABLEAU, 1, (to) => ({
    kind: "foundationToTableau",
    suit,
    to,
  }));
}

function fromTableau(
  state: GameState,
  from: number,
  index: number,
): Move | null {
  const column = state.tableau[from] as Column;
  // Face-down cards are not yours to move, and a tap on nothing is not a move.
  if (index < column.down || index >= column.cards.length) return null;

  const count = column.cards.length - index;
  const card = column.cards[index] as Card;

  // A run of more than one card can only go across; a foundation takes one at a time.
  if (count > 1) {
    return bestColumn(state, card, from, count, (to) => ({
      kind: "tableauToTableau",
      from,
      to,
      count,
    }));
  }

  return forSingleCard(state, card, from, (to) =>
    to === null
      ? { kind: "tableauToFoundation", from }
      : { kind: "tableauToTableau", from, to, count: 1 },
  );
}

function forSingleCard(
  state: GameState,
  card: Card,
  from: number,
  moveFor: MoveFor,
): Move | null {
  // 1 — home, whenever the foundation will take it. No "unless": see the note
  // on rule 1 above.
  const home = moveFor(null);
  if (isLegal(state, home)) return home;

  // 2 and 3 — a column with a card in it, then a hole for a King.
  return bestColumn(state, card, from, 1, moveFor);
}

/**
 * The best tableau target: a column with a card in it, else a hole for a King.
 *
 * Ties go to the leftmost column. That was flagged as arbitrary and as
 * something a play-test would want to revisit, and the audit above answers it:
 * 0.4% of taps that have a column to go to have more than one, and six
 * different tie-breaks — leftmost, rightmost, most buried, least buried,
 * shortest, longest — finish within one game of each other over four hundred
 * deals, at both draw counts. There is nothing here to tune, so it keeps the
 * rule whose only virtue is that a player can predict it.
 */
function bestColumn(
  state: GameState,
  card: Card,
  from: number,
  count: number,
  moveFor: (to: number) => Move,
): Move | null {
  let onCard: Move | null = null;
  let intoHole: Move | null = null;

  for (let to = 0; to < TABLEAU_COLUMNS; to++) {
    const move = moveFor(to);
    if (!isLegal(state, move)) continue;

    if ((state.tableau[to] as Column).cards.length > 0) {
      onCard ??= move;
      continue;
    }
    // 4 — an empty column, but never for a King that is already the whole of
    // one: relocating a hole is never what a tap meant.
    if (rankOf(card) === KING && !isLoneKing(state, from, count)) {
      intoHole ??= move;
    }
  }

  return onCard ?? intoHole;
}

/** Is this King the entire column it stands in? Moving it only moves the hole. */
function isLoneKing(state: GameState, from: number, count: number): boolean {
  if (from === OFF_TABLEAU) return false;
  const column = state.tableau[from] as Column;
  return column.down === 0 && count === column.cards.length;
}
