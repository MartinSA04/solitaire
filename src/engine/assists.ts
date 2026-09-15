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
import {
  type Column,
  type GameState,
  faceUpCount,
  isWon,
  topOf,
} from "./state.ts";

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

/** A generous ceiling; a real finish from a legitimate position is a few hundred moves at most. */
const AUTO_COMPLETE_LIMIT = 1000;

/**
 * The ordered run of moves that finishes the game, lowest rank first so the
 * cascade climbs the foundations rather than jumping about.
 *
 * Offered once no face-down tableau cards remain, which is the point at which
 * the deal is already won and the player is only owed the ceremony. It is the
 * opening beat of the win sequence, not a skip of it — see
 * docs/06-win-sequence.md.
 *
 * It is the way a person finishes a laid-open board: every card that comes up
 * either goes home or goes onto a run, and the stock is turned when neither is
 * possible. Both of those are safe once nothing is face down — the tableau is
 * all descending runs, so a card laid on one is never in the way of a card
 * that needs to go home before it.
 *
 * What it is guaranteed to finish, measured over a large corpus of endgames in
 * test/engine/assists.test.ts:
 *
 * - **Any position with an empty stock.** Every column is a descending run, so
 *   the lowest card still needed is always the top of one of them. That one is
 *   a proof, not a measurement.
 * - **Any draw-1 position.** Every stock card comes round to the top of the
 *   waste, so the same argument extends through the stock.
 * - **Nearly every draw-3 position.** Here a needed card can sit under one
 *   with nowhere to go, in a rotation that never exposes it. The searches
 *   below clear most of those; a board with a lot still in the stock can
 *   defeat them.
 *
 * So the caller checks. The sequence is bounded and always legal, and a
 * position this can't finish returns the progress it made rather than hanging
 * or lying — `isWon` on the result of replaying it is the honest test of
 * whether Finish can be offered.
 */
export function autoCompleteSequence(state: GameState): Move[] {
  const sequence: Move[] = [];
  let current = state;
  let sinceProgress = 0;

  while (!isWon(current) && sequence.length < AUTO_COMPLETE_LIMIT) {
    const move = lowestCardHome(current) ?? digOut(current);
    if (move !== null) {
      current = applyMove(current, move);
      sequence.push(move);
      sinceProgress = 0;
      continue;
    }

    // A whole pass has come round with nothing playable, so something is
    // pinned — a card in the waste under one with nowhere to go, or a card in
    // the tableau under a run. Look a few moves ahead for a way to shift it,
    // and keep looking at each turn of the stock, since which card is pinned
    // changes as the waste rotates.
    const pass = current.stock.length + current.waste.length + 1;
    if (sinceProgress > pass) {
      const escape = unblock(current) ?? rescue(current);
      if (escape !== null) {
        for (const move of escape) {
          current = applyMove(current, move);
          sequence.push(move);
        }
        sinceProgress = 0;
        continue;
      }
      // A second pass with nothing to play and nothing to shift. Done.
      if (sinceProgress > 2 * pass) break;
    }

    const turn: Move =
      current.stock.length > 0 ? { kind: "draw" } : { kind: "recycle" };
    if (!isLegal(current, turn)) break;
    current = applyMove(current, turn);
    sequence.push(turn);
    sinceProgress++;
  }

  return sequence;
}

/**
 * One move to make a landing spot, and the move that then unloads the waste
 * onto it. Shifting a run usually does it; failing that a card comes back off
 * a foundation, which is the one situation where that otherwise pointless move
 * is the only way home.
 *
 * The pair is applied together on purpose. Let the main loop back in between
 * and it would just send the fetched card straight home again, forever.
 */
function unblock(state: GameState): Move[] | null {
  for (const clear of legalMoves(state)) {
    if (clear.kind === "draw" || clear.kind === "recycle") continue;
    if (isHoleShuffle(state, clear)) continue;
    const unload = digOut(applyMove(state, clear));
    if (unload !== null) return [clear, unload];
  }
  return null;
}

/** Three moves is enough for "shift that run, fetch that card back, now play it". */
const RESCUE_DEPTH = 3;

function cardsHome(state: GameState): number {
  return state.foundations.reduce((total, pile) => total + pile.length, 0);
}

/**
 * Nothing in the waste can be shifted either, so something in the *tableau* is
 * pinned. Search a few moves deep for a way to get one more card home, leaving
 * the stock alone since turning it is what just failed. Shortest line first,
 * because the least disruption to the runs is almost always the right one.
 *
 * Insisting on a strictly better foundation count is what keeps this honest: a
 * line often has to fetch a card back off a foundation to make a landing spot,
 * and without that condition the search would happily "solve" the position by
 * putting that card back where it came from. Neither search is what bounds the
 * loop, though — `AUTO_COMPLETE_LIMIT` is.
 */
function rescue(state: GameState): Move[] | null {
  const target = cardsHome(state);
  for (let depth = 2; depth <= RESCUE_DEPTH; depth++) {
    const found = search(state, target, depth);
    if (found !== null) return found;
  }
  return null;
}

function search(
  state: GameState,
  target: number,
  depth: number,
): Move[] | null {
  if (cardsHome(state) > target) return [];
  if (depth === 0) return null;
  for (const move of legalMoves(state)) {
    if (move.kind === "draw" || move.kind === "recycle") continue;
    if (isHoleShuffle(state, move)) continue;
    const rest = search(applyMove(state, move), target, depth - 1);
    if (rest !== null) return [move, ...rest];
  }
  return null;
}

/**
 * Move the waste's top card out of the way, which in draw-3 is how you reach
 * the one underneath it. Onto a real column by preference, so the empty ones
 * stay free for the Kings that are the only thing that can use them.
 */
function digOut(state: GameState): Move | null {
  const moves = legalMoves(state).filter(
    (move) => move.kind === "wasteToTableau",
  );
  return (
    moves.find((move) => (state.tableau[move.to] as Column).cards.length > 0) ??
    moves[0] ??
    null
  );
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
