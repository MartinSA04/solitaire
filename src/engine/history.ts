import type { GameState } from "./state.ts";

/**
 * Undo stores whole states, not inverted moves.
 *
 * Inverting a move is wrong here because turnover is lossy: undoing a move has
 * to put a card back *face down*, and the move itself doesn't record whether
 * it caused a flip. Storing snapshots makes that impossible to get subtly
 * wrong, and with cards as integers and untouched piles shared between states,
 * a five-hundred-move game is a rounding error of memory.
 *
 * `states[0]` is the deal, so undo-to-start is free and "replay this deal" is
 * the same operation.
 */
export type History = { states: GameState[] };

export function createHistory(deal: GameState): History {
  return { states: [deal] };
}

export function currentState(history: History): GameState {
  return history.states[history.states.length - 1] as GameState;
}

export function record(history: History, state: GameState): void {
  history.states.push(state);
}

export function canUndo(history: History): boolean {
  return history.states.length > 1;
}

/** Step back one move. `false` at the deal, where there is nothing to undo. */
export function undo(history: History): boolean {
  if (!canUndo(history)) return false;
  history.states.pop();
  return true;
}

/** Back to the deal, keeping the same game. */
export function rewind(history: History): void {
  history.states.length = 1;
}
