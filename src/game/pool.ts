import { type DrawCount, MAX_SEED } from "../engine/index.ts";

/**
 * The winnable-deal pools: the build-time solver's output, and what
 * "winnable-only" deals from.
 *
 * `scripts/generate-winnable.ts` writes `src/data/winnable-{1,3}.bin` — the
 * winnable deal numbers from the bottom of the seed space upward, packed
 * little-endian, sorted and append-only. This module is the browser end of
 * that file: it fetches one and picks a deal out of it.
 *
 * Nothing waits on it. A first deal can come from the URL, from a resumed
 * save, or from an unfiltered random seed, with the pool applied from the next
 * deal onward. A pool that fails to load leaves a game that deals from the
 * whole 2³² space — a slightly harder game, not a broken one.
 */

/** Deal numbers, ascending. */
export type Pool = Uint32Array;

export const EMPTY_POOL: Pool = new Uint32Array(0);

/**
 * Written as two literal `new URL(…, import.meta.url)` expressions so that
 * Vite rewrites them into emitted asset URLs at build time, and so that Node
 * can read the very same files off disk in a test.
 */
const POOL_FILES: Record<DrawCount, URL> = {
  1: new URL("../data/winnable-1.bin", import.meta.url),
  3: new URL("../data/winnable-3.bin", import.meta.url),
};

/**
 * The pools this page has. One fetch per draw mode per load, started
 * alongside hydration and awaited by nothing.
 */
export class Pools {
  readonly #loaded = new Map<DrawCount, Pool>();
  readonly #loading = new Map<DrawCount, Promise<Pool>>();

  /** What has arrived. Empty before it does, which every caller treats as "no pool". */
  get(drawCount: DrawCount): Pool {
    return this.#loaded.get(drawCount) ?? EMPTY_POOL;
  }

  /**
   * A failure resolves to an empty pool rather than rejecting: there is no
   * error path in this product for "the deals we recommend didn't arrive".
   */
  load(drawCount: DrawCount): Promise<Pool> {
    const already = this.#loading.get(drawCount);
    if (already !== undefined) return already;

    const request = fetch(POOL_FILES[drawCount].href)
      .then(async (response) =>
        response.ok ? decodePool(await response.arrayBuffer()) : EMPTY_POOL,
      )
      .catch(() => EMPTY_POOL)
      .then((pool) => {
        this.#loaded.set(drawCount, pool);
        return pool;
      });

    this.#loading.set(drawCount, request);
    return request;
  }
}

/**
 * A packed `Uint32Array`, read little-endian explicitly rather than by casting
 * the buffer — the generator writes it that way, and a big-endian device
 * should get the same deals as everybody else rather than ten thousand
 * byte-swapped ones.
 */
export function decodePool(bytes: ArrayBuffer): Pool {
  const view = new DataView(bytes);
  const seeds = new Uint32Array(Math.floor(bytes.byteLength / 4));
  for (let index = 0; index < seeds.length; index++) {
    seeds[index] = view.getUint32(index * 4, true);
  }
  return seeds;
}

/**
 * A new deal number: from the pool when there is one, and from the whole seed
 * space when there isn't — which is what "winnable-only, off" means, and also
 * what happens for the first deal of a load that beat the fetch.
 *
 * `random` is a parameter so that the tests are not a coin toss.
 */
export function newSeed(
  pool: Pool,
  random: () => number = Math.random,
): number {
  if (pool.length === 0) return Math.floor(random() * (MAX_SEED + 1));
  return pool[Math.floor(random() * pool.length)] as number;
}
