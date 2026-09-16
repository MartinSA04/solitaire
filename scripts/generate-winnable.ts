/**
 * The winnable pools: `src/data/winnable-1.bin` and `winnable-3.bin`.
 *
 * Not part of `astro build`, and not part of `pnpm test` —
 * `node scripts/generate-winnable.ts --draw=1`, and it takes tens of minutes
 * across every core you have. Its output is committed, because the daily deal
 * depends on the pool not changing between builds. See docs/03-engine.md and
 * docs/07-architecture.md.
 *
 * It writes as it goes and picks up where it left off: a partially written
 * pool is a perfectly good pool, so an interrupted run is resumed rather than
 * repeated, and asking for more seeds later extends the file you already have.
 *
 * ## What a pool is
 *
 * The winnable deal numbers from the bottom of the seed space upward: every
 * seed from 0 is dealt and solved, and the ones the solver wins are kept in
 * seed order until there are `--count` of them. That single decision is what
 * makes the file **sorted and append-only at the same time** — extending the
 * pool means scanning further up, which appends, and the daily deal's frozen
 * prefix (the first 4,096 entries, see src/game/pool.ts) cannot move under it.
 *
 * Append-only holds only while {@link BUDGET} is what it was, which is why the
 * budget is a frozen constant here rather than a flag: a bigger budget would
 * find *extra* winnable seeds inside the range already scanned, and they would
 * land in the middle of the file and shift everybody's daily. If the pool ever
 * needs regenerating with a different budget, that is a new pool file and a
 * new name, exactly like a second RNG would be.
 *
 * ## What is checked before a seed goes in
 *
 * Every accepted seed's winning line is **replayed through `applyMove`**, the
 * same function the browser plays with, and the result asserted to be a win.
 * A solver that wins by a move the rules forbid is the one bug that would ship
 * silently — the pool would promise deals that cannot be won — and it costs
 * nothing to rule out here, because the line is already in hand.
 * `--verify` re-runs exactly that over a pool that has already been written.
 *
 * ## What it is not
 *
 * It is not "every winnable deal". A deal the solver can't crack inside the
 * budget is discarded as *unknown* rather than recorded as unwinnable, so the
 * pool is biased towards deals that are winnable *and* findable — the hardest
 * quarter of winnable draw-1 deals isn't in here. For a pool whose whole job
 * is "deal me one I can win", that bias is in the right direction.
 */
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";

import {
  type DrawCount,
  type GameState,
  applyMove,
  deal,
  isWon,
} from "../src/engine/index.ts";
import { solve } from "../src/engine/solve.ts";

/** Frozen with the pools. See the note above before changing it. */
const BUDGET = 200_000;

/** Seeds per task. Big enough that the messaging is noise, small enough to keep every core fed. */
const BLOCK = 64;

const DEFAULT_COUNT = 10_000;

/**
 * Write the pool out every this many new seeds. A partially written pool is a
 * perfectly good pool — sorted, from 0 upward — so a run that is interrupted
 * after an hour is resumed rather than repeated: the next run starts at the
 * last entry plus one.
 */
const FLUSH = 500;

type Task = { at: number; seeds: number[]; drawCount: DrawCount };
type Done = { at: number; winnable: number[] };

/**
 * Winnable, *and* proven so: the line the solver found, replayed through the
 * real rules. A solver that wins by a move Klondike forbids is the one bug
 * that would ship silently — the pool would promise deals nobody can win — and
 * ruling it out costs nothing here, because the line is already in hand. It is
 * not a seed to discard quietly either: it is a bug, and it stops the run.
 */
function reallyWins(seed: number, drawCount: DrawCount): boolean {
  const start = deal(seed, drawCount);
  const result = solve(start, { budget: BUDGET });
  if (result.outcome !== "solved") return false;

  let state = start;
  for (const move of result.moves) state = applyMove(state, move);
  if (!isWon(state)) {
    throw new Error(
      `solver claimed deal ${seed} (draw-${drawCount}) but its line does not win`,
    );
  }
  return true;
}

if (isMainThread) {
  await main();
} else {
  const { drawCount } = workerData as { drawCount: DrawCount };
  parentPort?.on("message", (task: Task) => {
    const winnable = task.seeds.filter((seed) => reallyWins(seed, drawCount));
    parentPort?.postMessage({ at: task.at, winnable } satisfies Done);
  });
}

async function main(): Promise<void> {
  const args = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key ?? "", value ?? "true"];
    }),
  );
  const drawCount: DrawCount = args.get("draw") === "3" ? 3 : 1;
  const count = Number(args.get("count") ?? DEFAULT_COUNT);
  const workers = Number(args.get("workers") ?? availableParallelism());
  const out = new URL(`../src/data/winnable-${drawCount}.bin`, import.meta.url);
  const pool = read(out);

  if (args.has("verify")) {
    await verify(pool, drawCount, workers);
    return;
  }

  const frontier =
    pool.length === 0 ? 0 : (pool[pool.length - 1] as number) + 1;
  console.error(
    `draw-${drawCount}: ${pool.length} seeds already pooled, scanning from ${frontier}` +
      ` for ${count} on ${workers} workers, budget ${BUDGET}`,
  );
  if (pool.length >= count) {
    console.error("nothing to do");
    return;
  }

  await scan({ pool, frontier, count, drawCount, workers, out });
  pool.length = count;
  writeFileSync(out, encode(pool));

  const scanned = (pool[pool.length - 1] as number) + 1;
  console.error(
    `wrote ${pool.length} seeds to ${out.pathname}` +
      ` (${scanned} scanned, ${((100 * pool.length) / scanned).toFixed(1)}% winnable)`,
  );
}

/**
 * Scan upward from the frontier until the pool is `count` long, growing it in
 * seed order however the blocks come back — a block that took four seconds
 * must not land behind one that took four milliseconds, or the file stops
 * being sorted and the daily's frozen prefix stops being frozen.
 */
async function scan(options: {
  pool: number[];
  frontier: number;
  count: number;
  drawCount: DrawCount;
  workers: number;
  out: URL;
}): Promise<void> {
  const { pool, count, drawCount, out } = options;
  let next = options.frontier;
  let reported = 0;
  let flushed = pool.length;

  await distribute({
    drawCount,
    workers: options.workers,
    take: () => {
      if (pool.length >= count) return null;
      const seeds = Array.from({ length: BLOCK }, (_, at) => next + at);
      next += BLOCK;
      return seeds;
    },
    done: (seeds, winnable) => {
      pool.push(...winnable);
      if (pool.length - reported >= 100) {
        reported = pool.length;
        const scanned = (seeds[seeds.length - 1] as number) + 1;
        console.error(`  ${pool.length}/${count} winnable, ${scanned} scanned`);
      }
      if (pool.length - flushed >= FLUSH) {
        flushed = pool.length;
        writeFileSync(out, encode(pool));
      }
      return pool.length < count;
    },
  });
}

/**
 * Every seed in a committed pool, re-solved and replayed. Run by hand when the
 * pool changes; test/engine/solve.test.ts does the same over a sample on every
 * test run, and the generator does it to each seed before it goes in.
 */
async function verify(
  pool: readonly number[],
  drawCount: DrawCount,
  workers: number,
): Promise<void> {
  console.error(
    `verifying ${pool.length} draw-${drawCount} seeds on ${workers} workers`,
  );
  let at = 0;
  let checked = 0;

  await distribute({
    drawCount,
    workers,
    take: () => (at >= pool.length ? null : pool.slice(at, (at += BLOCK))),
    done: (seeds, winnable) => {
      if (winnable.length !== seeds.length) {
        const bad = seeds.filter((seed) => !winnable.includes(seed));
        throw new Error(
          `pooled but not winnable at this budget: ${bad.join(", ")}`,
        );
      }
      checked += seeds.length;
      if (checked % 1000 < BLOCK) console.error(`  ${checked} verified`);
      return true;
    },
  });

  console.error(`all ${pool.length} draw-${drawCount} seeds replay to a win`);
}

/**
 * The worker pool. Blocks are handed out as fast as workers free up and
 * delivered to `done` **in the order they were issued**, which is what lets
 * the caller treat the results as a sequence rather than as a race.
 */
async function distribute(options: {
  drawCount: DrawCount;
  workers: number;
  /** The next block of seeds, or `null` when there is no more work. */
  take: () => number[] | null;
  /** In issue order. Return `false` to stop handing out work. */
  done: (seeds: number[], winnable: number[]) => boolean;
}): Promise<void> {
  const issued = new Map<number, number[]>();
  const returned = new Map<number, number[]>();
  let next = 0;
  let settled = 0;
  let live = 0;
  let stop = false;

  await new Promise<void>((resolve, reject) => {
    const workers = Array.from({ length: options.workers }, () => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { drawCount: options.drawCount },
      });
      worker.on("error", reject);
      return worker;
    });

    const finish = (): void => {
      for (const worker of workers) void worker.terminate();
      resolve();
    };

    const give = (worker: Worker): void => {
      const seeds = stop ? null : options.take();
      if (seeds === null) {
        if (live === 0) finish();
        return;
      }
      const at = next++;
      issued.set(at, seeds);
      live++;
      worker.postMessage({ at, seeds, drawCount: options.drawCount });
    };

    for (const worker of workers) {
      worker.on("message", (message: Done) => {
        live--;
        returned.set(message.at, message.winnable);

        // Drain in issue order, so the caller sees a sequence.
        for (let at = settled; returned.has(at); at++) {
          const seeds = issued.get(at) as number[];
          const winnable = returned.get(at) as number[];
          issued.delete(at);
          returned.delete(at);
          settled = at + 1;
          try {
            if (!options.done(seeds, winnable)) stop = true;
          } catch (error) {
            stop = true;
            for (const w of workers) void w.terminate();
            reject(error as Error);
            return;
          }
        }

        if (stop && live === 0) finish();
        else give(worker);
      });
      give(worker);
    }
  });
}

/**
 * A packed `Uint32Array`, **little-endian explicitly** on both sides — the
 * loader in src/game/pool.ts reads it with a `DataView` for the same reason.
 * Every platform this ships to is little-endian and the one that isn't should
 * get the same deals as everybody else.
 */
function encode(seeds: readonly number[]): Buffer {
  const bytes = Buffer.alloc(seeds.length * 4);
  seeds.forEach((seed, index) => bytes.writeUInt32LE(seed, index * 4));
  return bytes;
}

function read(file: URL): number[] {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    return [];
  }
  const seeds: number[] = [];
  for (let at = 0; at + 4 <= bytes.length; at += 4) {
    seeds.push(bytes.readUInt32LE(at));
  }
  return seeds;
}
