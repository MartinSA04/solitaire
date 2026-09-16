import {
  type Card,
  KING,
  cardAt,
  oppositeSuits,
  rankOf,
  suitOf,
} from "./card.ts";
import {
  emptiesColumn,
  isHoleShuffle,
  legalMoves,
  turnsOverCard,
} from "./enumerate.ts";
import { type Move, applyMove, isLegal } from "./moves.ts";
import { type Column, type GameState, faceUpCount, topOf } from "./state.ts";

/**
 * Hints and auto-complete: policy over the rules, not part of them. Klondike's
 * difficulty should come from the deal, not from the interface being stingy —
 * so both are unlimited, free, and never held back.
 */

/** The ranking from docs/02-game-spec.md, as numbers so ties break by enumeration order. */
const TURNS_A_CARD = 100;
const EMPTIES_A_COLUMN = 90;
const WASTE_TO_TABLEAU = 80;
const SAFE_TO_FOUNDATION = 70;
const NEEDED_TO_BUILD_ON = 40;
const SHUFFLING_RUNS = 30;

/**
 * One move worth making, best first, or `null` when there genuinely isn't one —
 * which the UI says plainly ("no moves left — undo, or try a new deal") rather
 * than dressing up as a loss screen.
 *
 * `null` is not merely "nothing on the board right now": the stock is walked a
 * full turn first, because "turn the stock" is a perfectly good hint and
 * telling a player they are stuck while an Ace is two draws away would be a
 * lie.
 */
export function hint(state: GameState): Move | null {
  const immediate = bestProductiveMove(state);
  if (immediate !== null) return immediate;

  // Nothing on the board. Walk the stock round once — one pass returns it to
  // exactly where it started, so if nothing surfaces, nothing ever will.
  const turn: Move =
    state.stock.length > 0 ? { kind: "draw" } : { kind: "recycle" };
  let current = state;
  const pass = state.stock.length + state.waste.length + 2;
  for (let step = 0; step < pass; step++) {
    const next: Move =
      current.stock.length > 0 ? { kind: "draw" } : { kind: "recycle" };
    if (!isLegal(current, next)) return null;
    current = applyMove(current, next);
    if (bestProductiveMove(current) !== null) return turn;
  }
  return null;
}

/**
 * The best move that changes the position, ignoring stock-turning and the two
 * kinds of move that only ever look like progress: pulling a card back off a
 * foundation, and moving a hole from one column to another.
 */
function bestProductiveMove(state: GameState): Move | null {
  let best: Move | null = null;
  let bestScore = 0;
  for (const move of legalMoves(state)) {
    if (!isProductive(state, move)) continue;
    const value = score(state, move);
    if (value > bestScore) {
      best = move;
      bestScore = value;
    }
  }
  return best;
}

function isProductive(state: GameState, move: Move): boolean {
  if (move.kind === "draw" || move.kind === "recycle") return false;
  // Legal, occasionally necessary, and never something to *advise*.
  if (move.kind === "foundationToTableau") return false;
  return !isHoleShuffle(state, move);
}

function score(state: GameState, move: Move): number {
  if (turnsOverCard(state, move)) return TURNS_A_CARD;
  if (emptiesColumn(state, move) && hasKingReady(state))
    return EMPTIES_A_COLUMN;
  if (move.kind === "wasteToTableau") return WASTE_TO_TABLEAU;
  if (move.kind === "wasteToFoundation") {
    return sendingHomeScore(state, cardAt(state.waste, state.waste.length - 1));
  }
  if (move.kind === "tableauToFoundation") {
    const column = state.tableau[move.from] as Column;
    return sendingHomeScore(
      state,
      cardAt(column.cards, column.cards.length - 1),
    );
  }
  return SHUFFLING_RUNS;
}

function sendingHomeScore(state: GameState, card: Card): number {
  return isSafeToSendHome(state, card)
    ? SAFE_TO_FOUNDATION
    : NEEDED_TO_BUILD_ON;
}

/**
 * Is there a King that could actually fill a column we are about to empty?
 * A King already sitting alone at the bottom of its own column doesn't count —
 * moving that one just relocates the hole.
 */
function hasKingReady(state: GameState): boolean {
  const waste = topOf(state.waste);
  if (waste !== undefined && rankOf(waste) === KING) return true;
  for (const column of state.tableau) {
    for (let i = column.down; i < column.cards.length; i++) {
      if (rankOf(cardAt(column.cards, i)) !== KING) continue;
      if (i > 0 || column.down > 0) return true;
    }
  }
  return false;
}

/**
 * Would sending this card home strand a tableau run that still needs it? A
 * card is safe once both opposite-colour cards one rank below it are already
 * on the foundations — nothing can ever want to be played onto it again.
 * Aces and twos are unconditionally safe.
 */
function isSafeToSendHome(state: GameState, card: Card): boolean {
  const rank = rankOf(card);
  if (rank <= 1) return true;
  const [a, b] = oppositeSuits(suitOf(card));
  return (
    (state.foundations[a] as Card[]).length >= rank &&
    (state.foundations[b] as Card[]).length >= rank
  );
}

/**
 * The ordered run of moves that finishes the game, lowest rank first so the
 * cascade climbs the four foundations together rather than finishing one suit
 * and then starting the next.
 *
 * Offered once {@link canAutoComplete} holds — every card face up in the
 * tableau, nothing left in the stock. That condition is what makes this as
 * simple as it looks: each column is a descending run, so the lowest card
 * still needed is always on top of one of them, and sending cards home in rank
 * order can never get stuck. Foundation moves to a fixpoint, and the fixpoint
 * is a win.
 *
 * It is the opening beat of the win sequence, not a skip of it — see
 * docs/06-win-sequence.md.
 *
 * Called on a position that doesn't qualify it still returns only legal moves,
 * but it will stop as soon as nothing more can go home. It turns no cards and
 * rearranges nothing: digging a needed card out of a draw-3 waste is playing
 * the game, and that is the player's to do.
 */
export function autoCompleteSequence(state: GameState): Move[] {
  const sequence: Move[] = [];
  let current = state;

  let move = lowestCardHome(current);
  while (move !== null) {
    current = applyMove(current, move);
    sequence.push(move);
    move = lowestCardHome(current);
  }

  return sequence;
}

function lowestCardHome(state: GameState): Move | null {
  let best: Move | null = null;
  let bestRank = Infinity;

  for (let from = 0; from < state.tableau.length; from++) {
    const column = state.tableau[from] as Column;
    if (faceUpCount(column) < 1) continue;
    const move: Move = { kind: "tableauToFoundation", from };
    if (!isLegal(state, move)) continue;
    const rank = rankOf(cardAt(column.cards, column.cards.length - 1));
    if (rank < bestRank) {
      best = move;
      bestRank = rank;
    }
  }

  const waste = topOf(state.waste);
  if (waste !== undefined && rankOf(waste) < bestRank) {
    const move: Move = { kind: "wasteToFoundation" };
    if (isLegal(state, move)) best = move;
  }

  return best;
}
