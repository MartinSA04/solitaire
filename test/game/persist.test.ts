import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type DealRecord,
  NO_DAILY,
  NO_STATS,
  Persist,
  RECORD_CAP,
  type Stats,
  type StorageLike,
  beatenRecord,
} from "../../src/game/Persist.ts";
import { AUTO, DEFAULTS, type Settings } from "../../src/game/settings.ts";

/**
 * Storage is untrusted input. It holds whatever the last version of this site
 * wrote, whatever another tab wrote a second ago, and whatever a curious
 * person pasted into a console — and it throws outright in private browsing.
 *
 * So the tests that matter here are the hostile ones. Every one of them
 * asserts the same thing in a different way: a bad read is a default, a failed
 * write is silence, and the game carries on.
 */

class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** Safari in private browsing, roughly: hands you a store that refuses to keep anything. */
class HostileStorage implements StorageLike {
  getItem(): string | null {
    throw new Error("SecurityError");
  }
  setItem(): void {
    throw new Error("QuotaExceededError");
  }
  removeItem(): void {
    throw new Error("SecurityError");
  }
}

function fresh(): { store: FakeStorage; persist: Persist } {
  const store = new FakeStorage();
  return { store, persist: new Persist(store) };
}

describe("settings", () => {
  it("are the defaults before anything has been chosen", () => {
    assert.deepEqual(fresh().persist.settings(), DEFAULTS);
  });

  it("round-trip", () => {
    const { store, persist } = fresh();
    const chosen: Settings = {
      theme: "dark",
      deck: "french",
      sound: false,
      timer: false,
      cardSize: "large",
      cardIndex: true,
      winnableOnly: false,
      drawCount: 3,
    };
    persist.saveSettings(chosen);
    assert.deepEqual(new Persist(store).settings(), chosen);
  });

  it("survive a value that is not one of ours", () => {
    const { store, persist } = fresh();
    store.setItem(
      "sol:v1:settings",
      JSON.stringify({
        v: 1,
        theme: "neon",
        deck: 7,
        back: null,
        sound: "yes",
        timer: undefined,
        cardSize: "enormous",
        winnableOnly: "no",
        drawCount: 5,
      }),
    );
    // Field by field, not all-or-nothing: one nonsense value should not cost
    // the player the other six choices.
    assert.deepEqual(persist.settings(), DEFAULTS);
  });

  it("keep the good half of a half-corrupt record", () => {
    const { store, persist } = fresh();
    store.setItem(
      "sol:v1:settings",
      JSON.stringify({ v: 1, theme: "dark", deck: "wombat", drawCount: 3 }),
    );
    assert.deepEqual(persist.settings(), {
      ...DEFAULTS,
      theme: "dark",
      deck: AUTO,
      drawCount: 3,
    });
  });

  it("ignore a key written by a schema that isn't this one", () => {
    const { store, persist } = fresh();
    store.setItem("sol:v1:settings", JSON.stringify({ v: 2, theme: "dark" }));
    assert.deepEqual(persist.settings(), DEFAULTS);
  });

  it("ignore text that isn't JSON at all", () => {
    const { store, persist } = fresh();
    store.setItem("sol:v1:settings", "{oh no");
    assert.deepEqual(persist.settings(), DEFAULTS);
    store.setItem("sol:v1:settings", "[1,2,3]");
    assert.deepEqual(persist.settings(), DEFAULTS);
  });
});

describe("the game in progress", () => {
  it("round-trips a save and its clock", () => {
    const { persist } = fresh();
    persist.saveGame({ game: '{"v":1,"seed":24}', elapsedMs: 134_000 });
    assert.deepEqual(persist.savedGame(), {
      game: '{"v":1,"seed":24}',
      elapsedMs: 134_000,
    });
  });

  it("is gone once the game is over", () => {
    const { persist } = fresh();
    persist.saveGame({ game: "x", elapsedMs: 1 });
    persist.clearGame();
    assert.equal(persist.savedGame(), null);
  });

  it("refuses a save with no game in it", () => {
    const { store, persist } = fresh();
    store.setItem("sol:v1:game", JSON.stringify({ v: 1, elapsedMs: 10 }));
    assert.equal(persist.savedGame(), null);
  });

  it("takes a nonsense clock as zero rather than dropping the game", () => {
    const { store, persist } = fresh();
    store.setItem(
      "sol:v1:game",
      JSON.stringify({ v: 1, game: "x", elapsedMs: -5 }),
    );
    assert.deepEqual(persist.savedGame(), { game: "x", elapsedMs: 0 });
  });
});

describe("lifetime stats", () => {
  it("start at nothing, in both draw modes", () => {
    assert.deepEqual(fresh().persist.stats(), { 1: NO_STATS, 3: NO_STATS });
  });

  it("count a game when it is played and again when it is won", () => {
    const { persist } = fresh();
    persist.countPlayed(1);
    persist.countPlayed(1);
    const after = persist.countWon(1, 240_000, 120);
    assert.deepEqual(after[1], {
      played: 2,
      won: 1,
      bestTimeMs: 240_000,
      fewestMoves: 120,
    });
    assert.deepEqual(after[3], NO_STATS);
  });

  it("keep the best of each, not the latest", () => {
    const { persist } = fresh();
    persist.countPlayed(3);
    persist.countWon(3, 300_000, 150);
    persist.countPlayed(3);
    const after = persist.countWon(3, 400_000, 100);
    assert.deepEqual(after[3], {
      played: 2,
      won: 2,
      bestTimeMs: 300_000,
      fewestMoves: 100,
    });
  });

  /** A win nobody saw the start of still happened. Played can never trail won. */
  it("never show more wins than games", () => {
    const { store, persist } = fresh();
    store.setItem(
      "sol:v1:stats",
      JSON.stringify({ v: 1, "1": { played: 0, won: 9 } }),
    );
    assert.equal(persist.stats()[1].played, 9);
  });

  it("drop impossible counters rather than showing them", () => {
    const { store, persist } = fresh();
    store.setItem(
      "sol:v1:stats",
      JSON.stringify({
        v: 1,
        "1": { played: "many", won: -3, bestTimeMs: 0, fewestMoves: NaN },
      }),
    );
    assert.deepEqual(persist.stats()[1], NO_STATS);
  });
});

describe("per-deal records", () => {
  it("remember your best on a deal, per draw mode", () => {
    const { persist } = fresh();
    persist.saveRecord(24, 1, 200_000, 140);
    persist.saveRecord(24, 3, 500_000, 180);
    assert.deepEqual(persist.record(24, 1), {
      seed: 24,
      drawCount: 1,
      bestTimeMs: 200_000,
      fewestMoves: 140,
    });
    assert.equal(persist.record(24, 3)?.bestTimeMs, 500_000);
    assert.equal(persist.record(25, 1), null);
  });

  it("improve a record one field at a time", () => {
    const { persist } = fresh();
    persist.saveRecord(24, 1, 200_000, 140);
    // Slower, but tidier: the fewest-moves record moves and the time doesn't.
    const after = persist.saveRecord(24, 1, 260_000, 118);
    assert.deepEqual(after, {
      seed: 24,
      drawCount: 1,
      bestTimeMs: 200_000,
      fewestMoves: 118,
    });
    assert.equal(persist.records().length, 1);
  });

  it("evict the least recently finished deal past the cap", () => {
    const { persist } = fresh();
    for (let seed = 0; seed < RECORD_CAP + 10; seed++) {
      persist.saveRecord(seed, 1, 100_000 + seed, 100);
    }
    const records = persist.records();
    assert.equal(records.length, RECORD_CAP);
    assert.equal(persist.record(0, 1), null, "the oldest is gone");
    assert.ok(persist.record(RECORD_CAP + 9, 1), "the newest is kept");

    // Finishing an old deal again makes it recent, so it outlives the next
    // eviction rather than being thrown away for being old.
    const oldest = records[0]?.seed as number;
    persist.saveRecord(oldest, 1, 90_000, 90);
    persist.saveRecord(99_999, 1, 90_000, 90);
    assert.ok(persist.record(oldest, 1));
  });

  it("skip entries that aren't records without losing the ones that are", () => {
    const { store, persist } = fresh();
    store.setItem(
      "sol:v1:records",
      JSON.stringify({
        v: 1,
        deals: [
          null,
          { seed: 1, drawCount: 1, bestTimeMs: 1000, fewestMoves: 90 },
          { seed: 2, drawCount: 9, bestTimeMs: 1000, fewestMoves: 90 },
          "nope",
          { seed: 3, drawCount: 3, bestTimeMs: 0, fewestMoves: 90 },
        ],
      }),
    );
    assert.deepEqual(
      persist.records().map((record) => record.seed),
      [1],
    );
  });
});

describe("the daily streak", () => {
  it("starts at one", () => {
    const { persist } = fresh();
    assert.deepEqual(persist.daily(), NO_DAILY);
    assert.deepEqual(persist.winDaily("2026-09-16", "2026-09-15"), {
      lastWon: "2026-09-16",
      current: 1,
      longest: 1,
    });
  });

  it("grows on consecutive days", () => {
    const { persist } = fresh();
    persist.winDaily("2026-09-15", "2026-09-14");
    persist.winDaily("2026-09-16", "2026-09-15");
    assert.deepEqual(persist.winDaily("2026-09-17", "2026-09-16"), {
      lastWon: "2026-09-17",
      current: 3,
      longest: 3,
    });
  });

  it("does not count the same day twice", () => {
    const { persist } = fresh();
    persist.winDaily("2026-09-16", "2026-09-15");
    assert.equal(persist.winDaily("2026-09-16", "2026-09-15").current, 1);
  });

  /** Breaking a streak costs nothing, and the longest one is still yours. */
  it("starts again after a missed day, keeping the longest", () => {
    const { persist } = fresh();
    persist.winDaily("2026-09-14", "2026-09-13");
    persist.winDaily("2026-09-15", "2026-09-14");
    assert.deepEqual(persist.winDaily("2026-09-20", "2026-09-19"), {
      lastWon: "2026-09-20",
      current: 1,
      longest: 2,
    });
  });
});

describe("with nowhere to write", () => {
  /**
   * The whole of docs/07's "the game is fully playable with storage
   * unavailable": nothing below throws, nothing returns something the caller
   * has to check, and the game that uses it cannot tell the difference.
   */
  for (const [name, store] of [
    ["no storage at all", null],
    ["a store that throws at everything", new HostileStorage()],
  ] as const) {
    it(`${name}: reads defaults and writes nothing, silently`, () => {
      const persist = new Persist(store);
      assert.equal(persist.available, store === null ? false : true);
      assert.deepEqual(persist.settings(), DEFAULTS);
      assert.equal(persist.savedGame(), null);
      assert.deepEqual(persist.stats(), { 1: NO_STATS, 3: NO_STATS });
      assert.deepEqual(persist.records(), []);
      assert.deepEqual(persist.daily(), NO_DAILY);

      persist.saveSettings(DEFAULTS);
      persist.saveGame({ game: "x", elapsedMs: 1 });
      persist.clearGame();
      persist.countPlayed(1);
      persist.countWon(1, 1000, 100);
      persist.saveRecord(1, 1, 1000, 100);
      persist.winDaily("2026-09-16", "2026-09-15");

      assert.deepEqual(persist.stats(), { 1: NO_STATS, 3: NO_STATS });
    });
  }
});

/**
 * The one line on the result panel, and the reason it is often absent. docs/06
 * asks for a record line "only if a record was set" — the absence is the
 * design: "you didn't beat your record" is a small punishment for winning.
 */
describe("what a win beat", () => {
  const record = (patch: Partial<DealRecord> = {}): DealRecord => ({
    seed: 24,
    drawCount: 1,
    bestTimeMs: 300_000,
    fewestMoves: 150,
    ...patch,
  });
  const stats = (patch: Partial<Stats> = {}): Stats => ({
    ...NO_STATS,
    played: 20,
    won: 9,
    bestTimeMs: 200_000,
    fewestMoves: 120,
    ...patch,
  });

  it("is nothing at all the first time you win a deal", () => {
    assert.equal(
      beatenRecord({ record: null, stats: stats() }, 250_000, 140),
      null,
    );
  });

  it("is nothing for a win that beat neither figure", () => {
    assert.equal(
      beatenRecord({ record: record(), stats: stats() }, 310_000, 160),
      null,
    );
  });

  it("is the fastest game yet, ahead of the deal's own record", () => {
    assert.equal(
      beatenRecord({ record: record(), stats: stats() }, 190_000, 160),
      "fastest",
    );
  });

  it("is the deal's best time, when it is only that", () => {
    assert.equal(
      beatenRecord({ record: record(), stats: stats() }, 250_000, 160),
      "deal-time",
    );
  });

  it("is the fewest moves when the clock was not beaten", () => {
    assert.equal(
      beatenRecord({ record: record(), stats: stats() }, 310_000, 140),
      "deal-moves",
    );
  });

  /** A very first game has no lifetime best to beat, which is not a record. */
  it("does not call a first-ever win the fastest game yet", () => {
    assert.equal(
      beatenRecord({ record: null, stats: NO_STATS }, 250_000, 140),
      null,
    );
  });
});
