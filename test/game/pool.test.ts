import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DAILY_POOL,
  EMPTY_POOL,
  type Pool,
  Pools,
  dailySeed,
  dayHash,
  dayKey,
  decodePool,
  newSeed,
  previousDayKey,
} from "../../src/game/pool.ts";

/**
 * The pools are the one piece of shipped *data* the game depends on, and two
 * of their properties are promises rather than conveniences: that the daily
 * deal is the same deal for everyone on a given date, forever, and that a
 * missing pool is a playable game rather than a broken one.
 */

function poolOf(seeds: readonly number[]): Pool {
  return Uint32Array.from(seeds);
}

function packed(seeds: readonly number[]): ArrayBuffer {
  const bytes = new Uint8Array(seeds.length * 4);
  const view = new DataView(bytes.buffer);
  seeds.forEach((seed, index) => view.setUint32(index * 4, seed, true));
  return bytes.buffer;
}

describe("decoding a pool", () => {
  it("reads deal numbers little-endian, whatever the machine prefers", () => {
    assert.deepEqual(
      [...decodePool(packed([0, 1, 4_294_967_295]))],
      [0, 1, 4_294_967_295],
    );
  });

  it("ignores a trailing partial entry rather than inventing a deal", () => {
    const bytes = new Uint8Array(6);
    new DataView(bytes.buffer).setUint32(0, 7, true);
    assert.deepEqual([...decodePool(bytes.buffer)], [7]);
  });

  it("is empty for an empty file", () => {
    assert.equal(decodePool(new ArrayBuffer(0)).length, 0);
  });
});

describe("picking a new deal", () => {
  it("comes out of the pool, when there is one", () => {
    const pool = poolOf([11, 22, 33, 44]);
    assert.equal(
      newSeed(pool, () => 0),
      11,
    );
    assert.equal(
      newSeed(pool, () => 0.99),
      44,
    );
    assert.equal(
      newSeed(pool, () => 0.5),
      33,
    );
  });

  /**
   * Winnable-only off, and also the first deal of a load that beat the fetch.
   * Both are the same code path on purpose: there is no state in which the
   * game cannot deal.
   */
  it("comes out of the whole seed space when there is no pool", () => {
    assert.equal(
      newSeed(EMPTY_POOL, () => 0),
      0,
    );
    assert.equal(
      newSeed(EMPTY_POOL, () => 0.999999999),
      4_294_967_291,
    );
    const seed = newSeed(EMPTY_POOL);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 4_294_967_295);
  });
});

describe("the daily deal", () => {
  /**
   * Frozen. If these values ever change, every player's streak is counting
   * days of a different game, and two people comparing times are not playing
   * the same deal.
   */
  it("hashes a date the same way forever", () => {
    assert.equal(dayHash("2026-09-16"), 2_396_009_415);
    assert.equal(dayHash("2026-09-17"), 2_379_231_796);
    assert.equal(dayHash("1970-01-01"), 1_421_751_008);
  });

  it("is a date in the player's own timezone, not UTC", () => {
    // 23:30 local on the 16th is the 16th's daily, wherever that is.
    assert.equal(dayKey(new Date(2026, 8, 16, 23, 30)), "2026-09-16");
    assert.equal(dayKey(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
    assert.equal(previousDayKey(new Date(2026, 0, 1, 0, 0)), "2025-12-31");
    assert.equal(previousDayKey(new Date(2026, 2, 1, 12, 0)), "2026-02-28");
  });

  it("gives the same deal to every visitor on a date", () => {
    const pool = poolOf(Array.from({ length: 5000 }, (_, i) => i * 3));
    const morning = dailySeed(pool, new Date(2026, 8, 16, 7, 12));
    const evening = dailySeed(pool, new Date(2026, 8, 16, 22, 48));
    assert.equal(morning, evening);
    assert.notEqual(morning, dailySeed(pool, new Date(2026, 8, 17, 7, 12)));
  });

  /**
   * The daily only ever indexes into the frozen prefix, so that extending the
   * pool later cannot move the deal a date already had.
   */
  it("never reaches past the frozen first 4,096 entries", () => {
    const pool = poolOf(Array.from({ length: 9000 }, (_, i) => 1000 + i));
    for (let day = 1; day <= 366; day++) {
      const seed = dailySeed(pool, new Date(2026, 0, day));
      assert.ok(seed !== null && seed < 1000 + DAILY_POOL, `day ${day}`);
    }
  });

  it("is nothing at all until the pool arrives", () => {
    assert.equal(dailySeed(EMPTY_POOL, new Date(2026, 8, 16)), null);
  });

  it("works from a pool smaller than the prefix", () => {
    const pool = poolOf([4, 8, 15, 16, 23, 42]);
    const seed = dailySeed(pool, new Date(2026, 8, 16));
    assert.ok(seed !== null && [...pool].includes(seed));
  });
});

/**
 * The fetch, which is the one thing in the product that goes to the network
 * after load — and the one thing nothing waits for. Every failure it can have
 * is the same failure: no pool, deals from the whole seed space, a game that
 * is slightly harder and not at all broken.
 */
describe("loading a pool", () => {
  async function withFetch<T>(
    stub: typeof globalThis.fetch,
    run: (pools: Pools) => Promise<T>,
  ): Promise<T> {
    const real = globalThis.fetch;
    globalThis.fetch = stub;
    try {
      return await run(new Pools());
    } finally {
      globalThis.fetch = real;
    }
  }

  const bytes = (seeds: readonly number[]): ArrayBuffer => {
    const out = new Uint8Array(seeds.length * 4);
    const view = new DataView(out.buffer);
    seeds.forEach((seed, index) => view.setUint32(index * 4, seed, true));
    return out.buffer;
  };

  it("decodes what it fetched, and remembers it", async () => {
    let calls = 0;
    await withFetch(
      async () => {
        calls++;
        return new Response(bytes([4, 8, 15]));
      },
      async (pools) => {
        assert.deepEqual([...pools.get(1)], [], "empty before it lands");
        assert.deepEqual([...(await pools.load(1))], [4, 8, 15]);
        assert.deepEqual([...pools.get(1)], [4, 8, 15]);

        // One fetch per draw mode per page load, however often it is asked for.
        await pools.load(1);
        assert.equal(calls, 1);
      },
    );
  });

  it("is an empty pool when the network says no", async () => {
    await withFetch(
      async () => {
        throw new Error("offline");
      },
      async (pools) => {
        assert.deepEqual([...(await pools.load(3))], []);
        assert.deepEqual([...pools.get(3)], []);
      },
    );
  });

  it("is an empty pool when the server says no", async () => {
    await withFetch(
      async () => new Response("not here", { status: 404 }),
      async (pools) => {
        assert.deepEqual([...(await pools.load(1))], []);
      },
    );
  });

  it("keeps the two draw modes apart", async () => {
    await withFetch(
      async (input) => {
        const url = String(input);
        return new Response(bytes(url.includes("winnable-3") ? [3] : [1]));
      },
      async (pools) => {
        assert.deepEqual([...(await pools.load(1))], [1]);
        assert.deepEqual([...(await pools.load(3))], [3]);
      },
    );
  });
});

/**
 * The files as committed. These are generated by
 * `node scripts/generate-winnable.ts`, which takes a machine-hour and is run
 * by hand; what a test can check is that what's in the repo has the shape the
 * daily deal's promise depends on. Whether the seeds are *really* winnable is
 * test/engine/solve.test.ts, which re-solves a sample of them.
 */
describe("the committed pools", () => {
  for (const drawCount of [1, 3] as const) {
    it(`draw-${drawCount}: is long enough for the daily's frozen prefix`, () => {
      const pool = readPool(drawCount);
      assert.ok(
        pool.length >= DAILY_POOL,
        `${pool.length} seeds, fewer than the ${DAILY_POOL} the daily indexes into`,
      );
      for (let index = 1; index < pool.length; index++) {
        assert.ok(
          (pool[index] as number) > (pool[index - 1] as number),
          `entry ${index} is out of order`,
        );
      }
    });
  }

  /**
   * The daily, pinned end to end: the hash, the frozen prefix and the pools as
   * committed. Extending a pool appends, so these values survive that — which
   * is the whole promise, and the only way to notice it being broken is to
   * have written the answers down before it was.
   */
  it("deals the same day the same deal, for good", () => {
    const dates = [
      [2026, 8, 16],
      [2027, 0, 1],
      [2030, 5, 15],
    ] as const;
    const expected = {
      1: [1358, 5598, 2892],
      3: [1650, 6789, 3523],
    };

    for (const drawCount of [1, 3] as const) {
      const pool = readPool(drawCount);
      dates.forEach(([year, month, day], at) => {
        assert.equal(
          dailySeed(pool, new Date(year, month, day, 12)),
          expected[drawCount][at],
          `draw-${drawCount} on ${year}-${month + 1}-${day}`,
        );
      });
    }
  });
});

function readPool(drawCount: 1 | 3): Pool {
  const bytes = readFileSync(
    new URL(`../../src/data/winnable-${drawCount}.bin`, import.meta.url),
  );
  return decodePool(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}
