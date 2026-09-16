import { type Card, RANK_COUNT, cardAt, rankOf, suitOf } from "./card.ts";
import { isHoleShuffle, legalMoves, turnsOverCard } from "./enumerate.ts";
import { type Move, applyMove } from "./moves.ts";
import { type Column, type GameState, faceUpCount, isWon } from "./state.ts";
import { isSafeToSendHome } from "./assists.ts";

/**
 * Can this deal be won with perfect play?
 *
 * The one part of the engine that never runs in the browser.
 * `scripts/generate-winnable.ts` runs it at build time over candidate seeds
 * and the site ships its *output* — which is also why it is not re-exported
 * from index.ts: nothing on the public surface should drag a search into a
 * phone's JS bundle.
 *
 * A depth-first search with the four things docs/03-engine.md names as what
 * makes Klondike tractable: a transposition table, forced-move collapse, move
 * ordering, and a node budget. The budget is the honest part. A search that
 * runs out is `"unknown"`, never `"unsolvable"` — a pool of known-good deals
 * doesn't have to be exhaustive, so discarding a winnable seed costs nothing
 * and claiming an unwinnable one is winnable costs a player their afternoon.
 */

export type SolveOutcome = "solved" | "unsolvable" | "unknown";

export type SolveResult = {
  outcome: SolveOutcome;
  /** The winning line, in order, when `outcome` is `"solved"`. Empty otherwise. */
  moves: Move[];
  /** Positions expanded. Equal to the budget is what an `"unknown"` looks like. */
  nodes: number;
};

export type SolveOptions = {
  /**
   * Positions to expand before giving up on this deal. Draw-1 mostly settles
   * well inside this; draw-3 is where a budget earns its keep.
   */
  budget?: number;
};

const DEFAULT_BUDGET = 200_000;

export function solve(
  start: GameState,
  options: SolveOptions = {},
): SolveResult {
  const budget = options.budget ?? DEFAULT_BUDGET;
  const seen = new Set<string>();
  const line: Move[] = [];
  let nodes = 0;
  let exhausted = false;

  /**
   * True the moment a win is reached, with `line` holding the way there.
   *
   * A position that has been expanded before is not expanded again: it failed
   * then and nothing about it has changed, since the key is the whole position.
   * When the budget stops a search that set holds positions that were *not*
   * explored to the end, which is exactly why running out reports `"unknown"`.
   */
  function search(state: GameState): boolean {
    if (isWon(state)) return true;
    if (nodes >= budget) {
      exhausted = true;
      return false;
    }
    const key = positionKey(state);
    if (seen.has(key)) return false;
    seen.add(key);
    nodes++;

    // Forced-move collapse. A card whose opposite-colour neighbours are both
    // home can never be wanted in the tableau again, so sending it there is
    // never wrong and needs no branch of its own. Early play is mostly aces
    // and twos, and this is what stops the search paying for them.
    const forced = forcedMove(state);
    if (forced !== null) {
      line.push(forced);
      if (search(applyMove(state, forced))) return true;
      line.pop();
      return false;
    }

    for (const move of ordered(state)) {
      line.push(move);
      if (search(applyMove(state, move))) return true;
      line.pop();
      if (exhausted) return false;
    }
    return false;
  }

  const solved = search(start);
  return {
    outcome: solved ? "solved" : exhausted ? "unknown" : "unsolvable",
    moves: solved ? line.slice() : [],
    nodes,
  };
}

/**
 * The move that needs no thought: the lowest-ranked card that is safe to send
 * home. Lowest first so the collapse is deterministic and the foundations
 * climb together.
 */
function forcedMove(state: GameState): Move | null {
  let best: Move | null = null;
  let bestRank = RANK_COUNT;

  for (let from = 0; from < state.tableau.length; from++) {
    const column = state.tableau[from] as Column;
    if (faceUpCount(column) < 1) continue;
    const card = cardAt(column.cards, column.cards.length - 1);
    if (!sendsHomeSafely(state, card) || rankOf(card) >= bestRank) continue;
    best = { kind: "tableauToFoundation", from };
    bestRank = rankOf(card);
  }

  const waste = state.waste[state.waste.length - 1];
  if (
    waste !== undefined &&
    sendsHomeSafely(state, waste) &&
    rankOf(waste) < bestRank
  ) {
    best = { kind: "wasteToFoundation" };
  }

  return best;
}

function sendsHomeSafely(state: GameState, card: Card): boolean {
  return (
    (state.foundations[suitOf(card)] as Card[]).length === rankOf(card) &&
    isSafeToSendHome(state, card)
  );
}

/**
 * Legal moves, most promising first. Progress in Klondike is turning cards
 * over, so those lead, deepest column first; taking a card back off a
 * foundation goes last, since it is only ever right in the few positions that
 * need it and it is the move that multiplies the tree.
 */
function ordered(state: GameState): Move[] {
  return (
    legalMoves(state)
      // Relabelling which column the hole is in changes nothing about the game.
      .filter((move) => !isHoleShuffle(state, move))
      .map((move, index) => ({ move, index, rank: priority(state, move) }))
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .map((entry) => entry.move)
  );
}

function priority(state: GameState, move: Move): number {
  if (turnsOverCard(state, move)) return 100 + buriedUnder(state, move);
  switch (move.kind) {
    case "wasteToFoundation":
    case "tableauToFoundation":
      return 60;
    case "wasteToTableau":
      return 50;
    case "tableauToTableau":
      return 40;
    case "draw":
      return 30;
    case "recycle":
      return 20;
    case "foundationToTableau":
      return 0;
  }
}

/** How many face-down cards sit under the move's source column. */
function buriedUnder(state: GameState, move: Move): number {
  if (move.kind === "tableauToFoundation" || move.kind === "tableauToTableau") {
    return (state.tableau[move.from] as Column).down;
  }
  return 0;
}

/**
 * A position's identity for the transposition table.
 *
 * The columns are **sorted** rather than listed in place, which collapses the
 * symmetry that costs a Klondike search most of its time: two boards that
 * differ only in which column a run sits in are the same position, and a run
 * that can go to either of two empty columns is two moves worth one search.
 * Nothing is reconstructed from this key, so the reordering is free.
 *
 * Foundations are lengths, because a foundation's contents are implied by how
 * tall it is.
 */
export function positionKey(state: GameState): string {
  const columns = state.tableau
    .map((column) => `${column.down}.${column.cards.join(",")}`)
    .sort();
  const foundations = state.foundations.map((pile) => pile.length).join(",");
  return `${state.stock.join(",")}/${state.waste.join(",")}/${foundations}/${columns.join(";")}`;
}
