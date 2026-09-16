/**
 * The engine's public surface.
 *
 * Everything under `src/engine/` is pure TypeScript: no DOM, no timers, no
 * randomness that isn't seeded, and no import from anywhere else in `src/`.
 * That is what lets the same rules run under `node --test`, inside the
 * build-time solver, and in the browser — and it keeps the win sequence free
 * to do whatever it likes to the pixels without the rules noticing.
 *
 * Time is not modelled here. The clock is the UI's problem.
 *
 * Two functions docs/03-engine.md puts on this surface are missing on purpose:
 * `dailySeed` and `randomWinnableSeed` both index into the winnable-deal pools,
 * which are the build-time solver's output and arrive with milestone 5. Until
 * then a new deal is any seed the caller likes.
 */

export {
  type Card,
  type Rank,
  type Suit,
  ACE,
  CLUBS,
  DECK_SIZE,
  DIAMONDS,
  HEARTS,
  KING,
  RANK_COUNT,
  SPADES,
  SUIT_COUNT,
  canStack,
  cardName,
  cardOf,
  isRed,
  rankOf,
  suitOf,
} from "./card.ts";
export {
  type Column,
  type DrawCount,
  type GameState,
  TABLEAU_COLUMNS,
  canAutoComplete,
  faceUpCount,
  isWon,
  topOf,
} from "./state.ts";
export { MAX_SEED, STOCK_CARDS, TABLEAU_CARDS, deal, isSeed } from "./deal.ts";
export { mulberry32, shuffledDeck } from "./rng.ts";
export {
  type Move,
  IllegalMoveError,
  applyMove,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  decodeMove,
  encodeMove,
  isLegal,
} from "./moves.ts";
export {
  emptiesColumn,
  isHoleShuffle,
  legalMoves,
  turnsOverCard,
} from "./enumerate.ts";
export { type History } from "./history.ts";
export { autoCompleteSequence, hint, isSafeToSendHome } from "./assists.ts";

import { autoCompleteSequence, hint } from "./assists.ts";
import { deal, isSeed } from "./deal.ts";
import {
  type History,
  canUndo,
  createHistory,
  currentState,
  record,
  rewind,
  undo,
} from "./history.ts";
import {
  type Move,
  applyMove,
  decodeMove,
  encodeMove,
  isLegal,
} from "./moves.ts";
import {
  type DrawCount,
  type GameState,
  canAutoComplete,
  isWon,
} from "./state.ts";

/**
 * A game in progress: a deal, the moves played on it, and the assists.
 *
 * `play` returns `false` for an illegal move rather than throwing, because the
 * UI speculates constantly — a tap means "do the obvious thing here", and a
 * tap on nothing in particular is not an exceptional condition.
 */
export interface Game {
  readonly state: GameState;
  readonly seed: number;
  readonly drawCount: DrawCount;
  readonly canUndo: boolean;
  readonly isWon: boolean;
  /** Every card face up in the tableau and the stock spent, so Finish can be offered. */
  readonly canAutoComplete: boolean;
  /**
   * Moves the player has made. Unlike `state.moves` this never goes down:
   * undo restores the board but not the record of what you did. It is not a
   * score, so there is nothing to cheat by rewinding it.
   */
  readonly movesPlayed: number;
  play(move: Move): boolean;
  undo(): boolean;
  /** Replay this deal: back to the deal, moves and history reset. */
  restart(): void;
  hint(): Move | null;
  autoCompleteSequence(): Move[];
  /** Seed plus move list, for localStorage. See docs/07-architecture.md. */
  serialise(): string;
}

const SAVE_VERSION = 1;

class KlondikeGame implements Game {
  readonly #history: History;
  readonly #played: Move[] = [];
  #movesPlayed = 0;

  constructor(seed: number, drawCount: DrawCount) {
    this.#history = createHistory(deal(seed, drawCount));
  }

  get state(): GameState {
    return currentState(this.#history);
  }

  get seed(): number {
    return this.state.seed;
  }

  get drawCount(): DrawCount {
    return this.state.drawCount;
  }

  get canUndo(): boolean {
    return canUndo(this.#history);
  }

  get isWon(): boolean {
    return isWon(this.state);
  }

  get canAutoComplete(): boolean {
    return canAutoComplete(this.state);
  }

  get movesPlayed(): number {
    return this.#movesPlayed;
  }

  /**
   * Not on the {@link Game} interface: only {@link deserialise} uses it, to
   * restore a move count that outlived the moves it replays.
   */
  restoreMoveCount(played: number): void {
    this.#movesPlayed = Math.max(this.#movesPlayed, played);
  }

  play(move: Move): boolean {
    const state = this.state;
    if (!isLegal(state, move)) return false;
    record(this.#history, applyMove(state, move));
    this.#played.push(move);
    this.#movesPlayed++;
    return true;
  }

  undo(): boolean {
    if (!undo(this.#history)) return false;
    this.#played.pop();
    return true;
  }

  restart(): void {
    rewind(this.#history);
    this.#played.length = 0;
    this.#movesPlayed = 0;
  }

  hint(): Move | null {
    return hint(this.state);
  }

  autoCompleteSequence(): Move[] {
    return autoCompleteSequence(this.state);
  }

  serialise(): string {
    return JSON.stringify({
      v: SAVE_VERSION,
      seed: this.seed,
      draw: this.drawCount,
      moves: this.#played.map(encodeMove),
      played: this.#movesPlayed,
    });
  }
}

export function newGame(seed: number, drawCount: DrawCount = 1): Game {
  if (!isSeed(seed)) {
    throw new RangeError(`deal number must be a uint32, got ${seed}`);
  }
  return new KlondikeGame(seed, drawCount);
}

/**
 * `/?deal=1234567&draw=3` — the whole of sharing a game. `null` for anything
 * that isn't a deal number we can honour, so the caller falls back to a fresh
 * deal rather than showing an error for a mistyped URL.
 */
export function fromSeedUrl(params: URLSearchParams): Game | null {
  const requested = params.get("deal");
  if (requested === null || !/^\d{1,10}$/.test(requested)) return null;
  const seed = Number(requested);
  if (!isSeed(seed)) return null;

  const draw = params.get("draw");
  if (draw !== null && draw !== "1" && draw !== "3") return null;
  return newGame(seed, draw === "3" ? 3 : 1);
}

/**
 * Restore a saved game by replaying its moves through the rules — which is
 * impossible to get subtly wrong, and rebuilds the undo stack for free.
 *
 * Anything that doesn't replay cleanly returns `null`. A corrupt save is a new
 * game, never an error dialog: storage holds whatever a user last pasted into
 * it, and none of it is worth interrupting someone over.
 */
export function deserialise(saved: string): Game | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { v, seed, draw, moves, played } = parsed as Record<string, unknown>;
  if (v !== SAVE_VERSION) return null;
  if (typeof seed !== "number" || !isSeed(seed)) return null;
  if (draw !== 1 && draw !== 3) return null;
  if (!Array.isArray(moves)) return null;

  const game = new KlondikeGame(seed, draw);
  for (const token of moves) {
    if (typeof token !== "string") return null;
    const move = decodeMove(token);
    if (move === null || !game.play(move)) return null;
  }

  // The player's move count outlives undos, so a save can legitimately record
  // more moves than it replays. Anything else is nonsense and gets ignored.
  if (typeof played === "number" && Number.isInteger(played)) {
    game.restoreMoveCount(played);
  }
  return game;
}
