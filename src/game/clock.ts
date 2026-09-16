/**
 * The clock is the UI's problem — the engine does not model time at all.
 *
 * It counts up from the first *move*, not from the deal, so a game left open
 * in a tab while you make coffee doesn't start at four minutes. Undo does not
 * rewind it: time is honest, moves are forgiving.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** `m:ss`, or `h:mm:ss` past an hour. Per docs/02-game-spec.md. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const seconds = Math.floor(total / SECOND) % 60;
  const minutes = Math.floor(total / MINUTE) % 60;
  const hours = Math.floor(total / HOUR);
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * A stopwatch that survives being backgrounded: it pauses when the tab is
 * hidden and resumes when it comes back, so an hour in another app is not an
 * hour on your record.
 *
 * `now` is injected, which is the only reason this is testable.
 */
export class Stopwatch {
  readonly #now: () => number;
  #accumulated = 0;
  #from: number | null = null;
  #started = false;

  constructor(now: () => number) {
    this.#now = now;
  }

  /** Has the player made their first move yet? */
  get started(): boolean {
    return this.#started;
  }

  get running(): boolean {
    return this.#from !== null;
  }

  get elapsed(): number {
    return this.#from === null
      ? this.#accumulated
      : this.#accumulated + (this.#now() - this.#from);
  }

  start(): void {
    if (this.#from !== null) return;
    this.#started = true;
    this.#from = this.#now();
  }

  pause(): void {
    if (this.#from === null) return;
    this.#accumulated += this.#now() - this.#from;
    this.#from = null;
  }

  /** Only resumes a clock that had already been started by a move. */
  resume(): void {
    if (this.#started) this.start();
  }

  reset(): void {
    this.#accumulated = 0;
    this.#from = null;
    this.#started = false;
  }
}
