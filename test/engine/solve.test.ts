import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  type Card,
  DECK_SIZE,
  cardName,
  rankOf,
} from "../../src/engine/card.ts";
import { deal } from "../../src/engine/deal.ts";
import { applyMove } from "../../src/engine/moves.ts";
import { legalMoves } from "../../src/engine/enumerate.ts";
import { positionKey, solve } from "../../src/engine/solve.ts";
import { type GameState, isWon } from "../../src/engine/state.ts";
import { invariantViolations, makeState, parseCards } from "./helpers.ts";

/**
 * The solver is the one component where "it compiles" means nothing: a bug in
 * it does not crash, it silently puts unwinnable deals in the pool that the
 * winnable-only setting promises are winnable.
 *
 * So the load-bearing test here is the last one — every claim in the shipped
 * pools is re-derived and then *replayed through the real rules*, which is the
 * only thing that catches a solver that wins by a move Klondike doesn't allow.
 */

describe("solve", () => {
  it("wins deals that can be won, and says how", () => {
    for (const seed of [0, 3, 5, 13, 17]) {
      const start = deal(seed, 1);
      const result = solve(start);
      assert.equal(result.outcome, "solved", `deal ${seed}`);
      assert.ok(isWon(replay(start, result.moves)), `deal ${seed} replays`);
    }
  });

  it("solves draw-3 deals too, where the stock is a rotation rather than a queue", () => {
    const start = deal(0, 3);
    const result = solve(start);
    assert.equal(result.outcome, "solved");
    assert.ok(isWon(replay(start, result.moves)));
  });

  it("reports a dead board as unsolvable, not as unknown", () => {
    const dead = deadlock();
    assert.deepEqual(invariantViolations(dead), []);
    assert.deepEqual(legalMoves(dead), [], "a deadlock has no moves at all");

    const result = solve(dead);
    assert.equal(result.outcome, "unsolvable");
    assert.deepEqual(result.moves, []);
  });

  it("finishes a position that is already won without playing a move", () => {
    const won = solve(finished());
    assert.equal(won.outcome, "solved");
    assert.deepEqual(won.moves, []);
    assert.equal(won.nodes, 0);
  });

  /**
   * The distinction the pools depend on. A budget that runs out means "we
   * didn't find out", and a seed we didn't find out about is discarded —
   * calling it unwinnable would be the one mistake that ships.
   */
  it("gives up as unknown rather than guessing unsolvable", () => {
    const result = solve(deal(4, 1), { budget: 500 });
    assert.equal(result.outcome, "unknown");
    assert.equal(result.nodes, 500);
    assert.deepEqual(result.moves, []);

    // The same deal with room to think is winnable after all, which is what
    // makes the budget a limit on the search rather than on the game.
    assert.equal(solve(deal(4, 1)).outcome, "solved");
  });

  it("only ever returns legal moves", () => {
    const start = deal(4, 1);
    const result = solve(start);
    assert.equal(result.outcome, "solved");
    // applyMove throws on an illegal move, so replaying is the assertion; the
    // invariant check catches a state that is legal move by move and nonsense
    // as a whole.
    const end = replay(start, result.moves);
    assert.deepEqual(invariantViolations(end), []);
  });
});

describe("the transposition key", () => {
  it("is the same for two boards that differ only in column order", () => {
    const spec = ["K♠", "Q♥ J♣", "", "7♦", "", "", ""];
    const shuffled = ["", "7♦", "Q♥ J♣", "", "", "K♠", ""];
    assert.equal(
      positionKey(makeState({ tableau: spec })),
      positionKey(makeState({ tableau: shuffled })),
    );
  });

  it("separates boards that differ in what is face down", () => {
    assert.notEqual(
      positionKey(makeState({ tableau: ["5♦ | 4♣"] })),
      positionKey(makeState({ tableau: ["5♦ 4♣"] })),
    );
  });

  it("separates boards that differ in the stock's rotation", () => {
    assert.notEqual(
      positionKey(makeState({ stock: "2♣ 3♣", waste: "4♣" })),
      positionKey(makeState({ stock: "3♣ 2♣", waste: "4♣" })),
    );
  });
});

/**
 * The pools, re-derived. Every seed in `src/data/winnable-*.bin` is a promise
 * to the player that the deal can be won; this samples that promise and
 * discharges it through `applyMove`, the same function the browser plays with.
 *
 * A sample rather than all 20,000, because the full set is the generator's
 * job and takes a machine-hour. Evenly spaced and fixed, so it is the same
 * sample on every run.
 */
describe("the shipped winnable pools", () => {
  for (const drawCount of [1, 3] as const) {
    it(`draw-${drawCount}: is sorted, unique, and made of deal numbers`, () => {
      const pool = readPool(drawCount);
      assert.ok(pool.length > 0, "pool is empty");
      for (let i = 0; i < pool.length; i++) {
        const seed = pool[i] as number;
        assert.ok(
          Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff,
          `entry ${i} is not a deal number: ${seed}`,
        );
        if (i > 0) {
          assert.ok(
            seed > (pool[i - 1] as number),
            `entry ${i} is out of order — the daily's frozen prefix depends on this`,
          );
        }
      }
    });

    it(`draw-${drawCount}: every sampled seed really is winnable`, () => {
      for (const seed of sample(readPool(drawCount), 8)) {
        const start = deal(seed, drawCount);
        const result = solve(start, { budget: 200_000 });
        assert.equal(
          result.outcome,
          "solved",
          `deal ${seed} draw-${drawCount}`,
        );
        const end = replay(start, result.moves);
        assert.ok(
          isWon(end),
          `deal ${seed} draw-${drawCount} replays to a win`,
        );
        assert.deepEqual(invariantViolations(end), []);
      }
    });
  }
});

function replay(
  start: GameState,
  moves: readonly { kind: string }[],
): GameState {
  let state = start;
  for (const move of moves) state = applyMove(state, move as never);
  return state;
}

function readPool(drawCount: 1 | 3): number[] {
  const bytes = readFileSync(
    new URL(`../../src/data/winnable-${drawCount}.bin`, import.meta.url),
  );
  const seeds: number[] = [];
  for (let at = 0; at + 4 <= bytes.length; at += 4) {
    seeds.push(bytes.readUInt32LE(at));
  }
  return seeds;
}

function sample(pool: readonly number[], count: number): number[] {
  const step = Math.max(1, Math.floor(pool.length / count));
  const seeds: number[] = [];
  for (let at = 0; at < pool.length && seeds.length < count; at += step) {
    seeds.push(pool[at] as number);
  }
  return seeds;
}

/**
 * A full deck arranged so that nothing whatever can be played: seven columns
 * with a black card on top of each, so no card can stack on any other, no ace
 * is exposed, no column is empty for a King, and the stock is spent.
 */
function deadlock(): GameState {
  const tops = parseCards("2♣ 3♣ 4♣ 5♣ 6♣ 7♣ 8♣");
  const rest: Card[] = [];
  for (let card = 0; card < DECK_SIZE; card++) {
    if (!tops.includes(card)) rest.push(card);
  }

  // 45 cards under 7 tops: six columns of six and one of nine.
  const tableau: string[] = [];
  let at = 0;
  for (let column = 0; column < 7; column++) {
    const depth = column === 6 ? 9 : 6;
    const down = rest.slice(at, at + depth);
    at += depth;
    tableau.push(
      `${down.map(cardName).join(" ")} | ${cardName(tops[column] as Card)}`,
    );
  }
  return makeState({ tableau });
}

/** Every card home. */
function finished(): GameState {
  const state = makeState({ foundations: "K♣ K♦ K♥ K♠" });
  assert.ok(state.foundations.every((pile) => rankOf(pile.length - 1) === 12));
  return state;
}
