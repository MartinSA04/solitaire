import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deal } from "../../src/engine/deal.ts";
import { legalMoves } from "../../src/engine/enumerate.ts";
import { type Move, applyMove, encodeMove } from "../../src/engine/moves.ts";
import { mulberry32 } from "../../src/engine/rng.ts";
import { invariantViolations } from "./helpers.ts";

/**
 * The test that finds real bugs.
 *
 * A thousand deals, two hundred random legal moves each, checking after every
 * one that all fifty-two cards are still present exactly once, that no column
 * claims more face-down cards than it holds, that no column is left entirely
 * face down, that every face-up run is properly sequenced, and that the
 * foundations ascend in suit from the Ace with no gaps.
 *
 * Card conservation and foundation ordering are cheap to check and catch
 * almost every class of mistake an engine like this makes. The seeds come from
 * the engine's own PRNG so a failure is reproducible — the move list it prints
 * replays exactly.
 */
describe("playing at random", () => {
  it("never violates an invariant, over a thousand deals", () => {
    const pick = mulberry32(0x50117a1e);
    for (let game = 0; game < 1000; game++) {
      const seed = pick();
      const drawCount = pick() % 2 === 0 ? 1 : 3;
      let state = deal(seed, drawCount);
      const played: Move[] = [];

      for (let step = 0; step < 200; step++) {
        const moves = legalMoves(state);
        if (moves.length === 0) break;
        const move = moves[pick() % moves.length] as Move;
        played.push(move);
        state = applyMove(state, move);

        const problems = invariantViolations(state);
        if (problems.length > 0) {
          assert.fail(
            `deal ${seed} draw-${drawCount} after ${played
              .map(encodeMove)
              .join(" ")}:\n  ${problems.join("\n  ")}`,
          );
        }
      }
      assert.equal(state.moves, played.length);
      assert.equal(state.seed, seed);
      assert.equal(state.drawCount, drawCount);
    }
  });
});
