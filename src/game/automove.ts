import {
  type Card,
  type Column,
  type GameState,
  type Move,
  KING,
  TABLEAU_COLUMNS,
  isLegal,
  isSafeToSendHome,
  rankOf,
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
 * 1. A foundation, if legal — unless the card could still be built on.
 * 2. A tableau column that turns over a face-down card.
 * 3. A non-empty tableau column.
 * 4. An empty column, for a King that isn't already sitting on nothing.
 *
 * Two of those need a word. Rule 2 cannot discriminate between the *targets*
 * of a single tap — whether a move turns a card over depends entirely on the
 * column it leaves, which is the same for every candidate — so for one tapped
 * card rules 2 and 3 collapse into "a column with a card in it, before an
 * empty one". And the doc leaves one case implicit: when none of 2–4 exist, a
 * legal foundation move is played even if it isn't "safe", because a tap on
 * the only playable card doing nothing reads as broken.
 *
 * Every auto-move is undoable, which is what lets the heuristic be aggressive.
 */
export function autoMove(state: GameState, hit: Hit): Move | null {
  switch (hit.ref.pile) {
    // Tapping the stock turns it; tapping the empty stock puts it back.
    case "stock":
      return state.stock.length > 0 ? { kind: "draw" } : { kind: "recycle" };

    case "waste":
      return hit.index === state.waste.length - 1
        ? forSingleCard(state, hit.card as Card, FROM_WASTE, wasteMove)
        : null;

    // A card can be dragged back off a foundation when a run needs it, but
    // nothing about a tap says "bring that back", so a tap does nothing.
    case "foundation":
      return null;

    case "tableau":
      return fromTableau(state, hit.ref.column, hit.index);
  }
}

/** The waste, as a source column. Not a column, and never equal to one. */
const FROM_WASTE = -1;

/** Builds the move that sends this card to column `to`, or home when `to` is `null`. */
type MoveFor = (to: number | null) => Move;

const wasteMove: MoveFor = (to) =>
  to === null ? { kind: "wasteToFoundation" } : { kind: "wasteToTableau", to };

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
  const home = moveFor(null);
  const homeIsLegal = isLegal(state, home);

  // 1 — home, but only while nothing in the tableau could still want it.
  if (homeIsLegal && isSafeToSendHome(state, card)) return home;

  const across = bestColumn(state, card, from, 1, moveFor);
  if (across !== null) return across;

  // Nowhere to put it but home.
  return homeIsLegal ? home : null;
}

/**
 * The best tableau target: a column with a card in it, else a hole for a King.
 * Ties go to the leftmost column, which is arbitrary but at least predictable —
 * one of the things a play-test will want to revisit.
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
  if (from === FROM_WASTE) return false;
  const column = state.tableau[from] as Column;
  return column.down === 0 && count === column.cards.length;
}
