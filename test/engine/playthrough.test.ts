import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RANK_COUNT } from "../../src/engine/card.ts";
import { deal } from "../../src/engine/deal.ts";
import { applyMove, encodeMove } from "../../src/engine/moves.ts";
import { isWon } from "../../src/engine/state.ts";
import { deserialise, newGame } from "../../src/engine/index.ts";
import { invariantViolations, playGreedily } from "./helpers.ts";

/**
 * Milestone 0's bar: a complete game of Klondike can be played to a win.
 *
 * `playGreedily` is a test-only player — it is not the hint heuristic and
 * nothing ships it — but it only ever asks the engine for legal moves and
 * plays them, so a win is an end-to-end proof that the rules compose into the
 * game they are supposed to be. It is deterministic, so these are facts about
 * these deals rather than a sample that might come out differently tomorrow.
 */

const WINNABLE_BY_GREED = {
  1: [3, 5, 6, 11, 14, 16, 17, 19, 20, 23],
  3: [3, 15, 27, 31, 33, 34, 41, 50, 51, 52],
} as const;

describe("playing a deal out to a win", () => {
  for (const drawCount of [1, 3] as const) {
    it(`wins a draw-${drawCount} deal, every card home`, () => {
      const seed = WINNABLE_BY_GREED[drawCount][0];
      const start = deal(seed, drawCount);
      const { state, moves } = playGreedily(start);

      assert.ok(isWon(state), `deal ${seed} did not finish`);
      assert.deepEqual(invariantViolations(state), []);
      for (const pile of state.foundations) {
        assert.equal(pile.length, RANK_COUNT);
      }
      assert.deepEqual(state.stock, []);
      assert.deepEqual(state.waste, []);
      for (const column of state.tableau) assert.deepEqual(column.cards, []);
      assert.equal(state.moves, moves.length);
    });
  }

  it("wins the deals it has always won", () => {
    for (const [draw, seeds] of Object.entries(WINNABLE_BY_GREED)) {
      const drawCount = Number(draw) as 1 | 3;
      for (const seed of seeds) {
        const { state } = playGreedily(deal(seed, drawCount));
        assert.ok(isWon(state), `draw-${drawCount} deal ${seed}`);
      }
    }
  });

  it("replays the same win from the seed and the move list alone", () => {
    const seed = WINNABLE_BY_GREED[1][0];
    const start = deal(seed, 1);
    const { state, moves } = playGreedily(start);

    assert.deepEqual(moves.reduce(applyMove, start), state);

    const saved = JSON.stringify({
      v: 1,
      seed,
      draw: 1,
      moves: moves.map(encodeMove),
      played: moves.length,
    });
    const restored = deserialise(saved);
    assert.deepEqual(restored?.state, state);
    assert.equal(restored?.isWon, true);
  });

  it("can be undone all the way back to the deal", () => {
    const seed = WINNABLE_BY_GREED[1][1];
    const game = newGame(seed, 1);
    const dealt = structuredClone(game.state);
    for (const move of playGreedily(game.state).moves) {
      assert.equal(game.play(move), true, encodeMove(move));
    }
    assert.equal(game.isWon, true);

    while (game.undo());
    assert.deepEqual(game.state, dealt);
  });
});
