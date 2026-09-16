import type { DrawCount } from "../engine/index.ts";
import {
  AUTO,
  DECKS,
  DEFAULTS,
  SETTINGS_KEY,
  CARD_SIZES,
  THEMES,
  type Settings,
} from "./settings.ts";

/**
 * `localStorage`, one key per concern, namespaced and versioned.
 *
 * ```text
 * sol:v1:settings   the look, the sound, the clock, the draw mode, winnable-only
 * sol:v1:game       the game in progress: a seed, a move list, a clock
 * sol:v1:stats      lifetime counters, per draw mode
 * sol:v1:records    per-deal bests, capped at 500 and evicted least-recent-first
 * sol:v1:daily      the last daily completed, and the streak
 * ```
 *
 * Three rules, all of them from docs/07-architecture.md, and all of them the
 * reason this file is longer than it looks like it needs to be:
 *
 * 1. **Every read is defensive.** Storage throws in private browsing, returns
 *    `null` when cleared, and holds whatever a user last pasted into it. Every
 *    accessor is wrapped, every parse is validated field by field against the
 *    shape it should have, and any failure falls back to the default
 *    *silently*. A corrupt save is a new game, never an error dialog.
 * 2. **The game is fully playable with storage unavailable.** Nothing is
 *    awaited on it and nothing branches on whether it worked. `Persist` with a
 *    `null` store is a complete, working object that remembers nothing.
 * 3. **Nothing written identifies the player.** No ids, no first-seen date, no
 *    timestamps beyond the local calendar day the streak is counted in.
 *
 * Migration, when there is a v2: read `v1` if present, write `v2`, delete
 * `v1`. Never a silent in-place reinterpretation of a key.
 */

const PREFIX = "sol:v1:";
const VERSION = 1;

/** Per-deal bests, oldest evicted first. Unbounded growth eventually throws on a device you don't own. */
export const RECORD_CAP = 500;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Lifetime counters for one draw mode. There is no losses column, by design. */
export interface Stats {
  played: number;
  won: number;
  bestTimeMs: number | null;
  fewestMoves: number | null;
}

export type AllStats = Record<DrawCount, Stats>;

/** What you did on one deal, the last time you finished it and at your best. */
export interface DealRecord {
  seed: number;
  drawCount: DrawCount;
  bestTimeMs: number;
  fewestMoves: number;
}

export interface Daily {
  /** The last local day whose daily was won, `YYYY-MM-DD`. */
  lastWon: string | null;
  current: number;
  longest: number;
}

export interface SavedGame {
  /** The engine's own save string — a seed and a move list. Opaque here. */
  game: string;
  elapsedMs: number;
}

/** Which record a win beat, if it beat one. The result panel's one line. */
export type BeatenRecord = "fastest" | "deal-time" | "deal-moves";

/**
 * What to say on the result panel, read off the figures *before* this win was
 * recorded.
 *
 * Only an improvement counts. A first win on a deal beats nothing — "you set a
 * record on the deal you have played once" is a participation trophy — and a
 * win that beats nothing gets no line at all, because "you didn't beat your
 * record" is a small punishment for winning. One line, best claim first.
 */
export function beatenRecord(
  before: { record: DealRecord | null; stats: Stats },
  timeMs: number,
  moves: number,
): BeatenRecord | null {
  if (before.stats.bestTimeMs !== null && timeMs < before.stats.bestTimeMs) {
    return "fastest";
  }
  if (before.record === null) return null;
  if (timeMs < before.record.bestTimeMs) return "deal-time";
  if (moves < before.record.fewestMoves) return "deal-moves";
  return null;
}

export const NO_STATS: Stats = Object.freeze({
  played: 0,
  won: 0,
  bestTimeMs: null,
  fewestMoves: null,
});

export const NO_DAILY: Daily = Object.freeze({
  lastWon: null,
  current: 0,
  longest: 0,
});

/**
 * `localStorage` if this browser will give it to us. Merely *reaching* for it
 * throws when cookies are blocked, which is why this is a function with a
 * try/catch around a property access.
 */
export function browserStorage(): StorageLike | null {
  try {
    const store = globalThis.localStorage;
    // Safari's private mode used to hand over a store that throws on write.
    // Find out now, on a key we then remove, rather than mid-game.
    const probe = `${PREFIX}probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export class Persist {
  readonly #store: StorageLike | null;

  constructor(store: StorageLike | null = browserStorage()) {
    this.#store = store;
  }

  /** Whether anything written here will still be here next time. The UI never asks. */
  get available(): boolean {
    return this.#store !== null;
  }

  // ── settings ──────────────────────────────────────────────────────────

  settings(): Settings {
    const raw = this.#read("settings");
    if (raw === null) return { ...DEFAULTS };
    return {
      theme: oneOf(raw.theme, THEMES, DEFAULTS.theme),
      deck: oneOf(raw.deck, [AUTO, ...DECKS], DEFAULTS.deck),
      sound: boolish(raw.sound, DEFAULTS.sound),
      timer: boolish(raw.timer, DEFAULTS.timer),
      cardSize: oneOf(raw.cardSize, CARD_SIZES, DEFAULTS.cardSize),
      cardIndex: boolish(raw.cardIndex, DEFAULTS.cardIndex),
      winnableOnly: boolish(raw.winnableOnly, DEFAULTS.winnableOnly),
      drawCount: raw.drawCount === 3 ? 3 : 1,
    };
  }

  saveSettings(settings: Settings): void {
    this.#write("settings", settings);
  }

  // ── the game in progress ──────────────────────────────────────────────

  savedGame(): SavedGame | null {
    const raw = this.#read("game");
    if (raw === null) return null;
    if (typeof raw.game !== "string") return null;
    return { game: raw.game, elapsedMs: count(raw.elapsedMs, 0) };
  }

  saveGame(game: SavedGame): void {
    this.#write("game", game);
  }

  /** A finished game is not in progress. Called on a win and on a new deal. */
  clearGame(): void {
    this.#remove("game");
  }

  // ── lifetime stats ────────────────────────────────────────────────────

  stats(): AllStats {
    const raw = this.#read("stats");
    return {
      1: statsOf(raw?.["1"]),
      3: statsOf(raw?.["3"]),
    };
  }

  /**
   * A deal counts as played the moment a move is made on it, not when it is
   * dealt: dealing and walking away is not a game, and counting it would make
   * the win rate a measure of how often you open the tab.
   */
  countPlayed(drawCount: DrawCount): AllStats {
    const all = this.stats();
    all[drawCount] = { ...all[drawCount], played: all[drawCount].played + 1 };
    this.#write("stats", all);
    return all;
  }

  countWon(drawCount: DrawCount, timeMs: number, moves: number): AllStats {
    const all = this.stats();
    const before = all[drawCount];
    all[drawCount] = {
      played: Math.max(before.played, before.won + 1),
      won: before.won + 1,
      bestTimeMs: lower(before.bestTimeMs, timeMs),
      fewestMoves: lower(before.fewestMoves, moves),
    };
    this.#write("stats", all);
    return all;
  }

  // ── per-deal records ──────────────────────────────────────────────────

  records(): DealRecord[] {
    const raw = this.#read("records");
    const list = Array.isArray(raw?.deals) ? raw.deals : [];
    const records: DealRecord[] = [];
    for (const entry of list) {
      const record = recordOf(entry);
      if (record !== null) records.push(record);
    }
    return records.slice(-RECORD_CAP);
  }

  /** Your best on this deal, for the "race yourself" line on a replay. */
  record(seed: number, drawCount: DrawCount): DealRecord | null {
    return (
      this.records().find(
        (entry) => entry.seed === seed && entry.drawCount === drawCount,
      ) ?? null
    );
  }

  /**
   * Keep a finished deal. Most recent last, capped, and the cap evicts the
   * least recently *finished* rather than the worst — a record you are not
   * coming back to is not worth a device's storage quota.
   */
  saveRecord(
    seed: number,
    drawCount: DrawCount,
    timeMs: number,
    moves: number,
  ): DealRecord {
    const existing = this.record(seed, drawCount);
    const record: DealRecord = {
      seed,
      drawCount,
      bestTimeMs: lower(existing?.bestTimeMs ?? null, timeMs) ?? timeMs,
      fewestMoves: lower(existing?.fewestMoves ?? null, moves) ?? moves,
    };
    const deals = this.records()
      .filter((entry) => entry.seed !== seed || entry.drawCount !== drawCount)
      .concat(record)
      .slice(-RECORD_CAP);
    this.#write("records", { deals });
    return record;
  }

  // ── the daily streak ──────────────────────────────────────────────────

  daily(): Daily {
    const raw = this.#read("daily");
    if (raw === null) return { ...NO_DAILY };
    return {
      lastWon: typeof raw.lastWon === "string" ? raw.lastWon : null,
      current: count(raw.current, 0),
      longest: count(raw.longest, 0),
    };
  }

  /**
   * Today's daily is done. The streak continues if yesterday's was too, and
   * otherwise starts again at one — which costs nothing and is never
   * commented on anywhere in the interface.
   */
  winDaily(today: string, yesterday: string): Daily {
    const before = this.daily();
    if (before.lastWon === today) return before;
    const current = before.lastWon === yesterday ? before.current + 1 : 1;
    const daily: Daily = {
      lastWon: today,
      current,
      longest: Math.max(before.longest, current),
    };
    this.#write("daily", daily);
    return daily;
  }

  // ── the wrapped store ─────────────────────────────────────────────────

  #read(key: string): Record<string, unknown> | null {
    let raw: string | null;
    try {
      raw = this.#store?.getItem(keyOf(key)) ?? null;
    } catch {
      return null;
    }
    if (raw === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    // A key written by a version that isn't this one is not ours to read.
    if (record["v"] !== VERSION) return null;
    return record;
  }

  /** A write that fails — quota, private mode, a disappearing store — is not worth a word to the player. */
  #write(key: string, value: object): void {
    try {
      this.#store?.setItem(
        keyOf(key),
        JSON.stringify({ v: VERSION, ...value }),
      );
    } catch {
      /* nothing here is worth interrupting a game over */
    }
  }

  #remove(key: string): void {
    try {
      this.#store?.removeItem(keyOf(key));
    } catch {
      /* as above */
    }
  }
}

/**
 * The settings key is named in settings.ts, because the pre-paint bootstrap in
 * there reads it before this module exists. Everything else is ours.
 */
function keyOf(key: string): string {
  return key === "settings" ? SETTINGS_KEY : PREFIX + key;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function boolish(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** A non-negative finite number, or the fallback. Storage is untrusted input. */
function count(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function lower(existing: number | null, candidate: number): number | null {
  if (!Number.isFinite(candidate) || candidate < 0) return existing;
  return existing === null ? candidate : Math.min(existing, candidate);
}

function statsOf(value: unknown): Stats {
  if (typeof value !== "object" || value === null) return { ...NO_STATS };
  const raw = value as Record<string, unknown>;
  const won = count(raw["won"], 0);
  return {
    played: Math.max(count(raw["played"], 0), won),
    won,
    bestTimeMs: positive(raw["bestTimeMs"]),
    fewestMoves: positive(raw["fewestMoves"]),
  };
}

function recordOf(value: unknown): DealRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const seed = raw["seed"];
  const drawCount = raw["drawCount"];
  const bestTimeMs = positive(raw["bestTimeMs"]);
  const fewestMoves = positive(raw["fewestMoves"]);
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0) {
    return null;
  }
  if (drawCount !== 1 && drawCount !== 3) return null;
  if (bestTimeMs === null || fewestMoves === null) return null;
  return { seed, drawCount, bestTimeMs, fewestMoves };
}
