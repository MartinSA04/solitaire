import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { autoCompleteSequence, hint } from "../../src/engine/assists.ts";
import { deal } from "../../src/engine/deal.ts";
import { legalMoves } from "../../src/engine/enumerate.ts";
import { type Move, applyMove, encodeMove } from "../../src/engine/moves.ts";
import { mulberry32 } from "../../src/engine/rng.ts";
import {
  type DrawCount,
  type GameState,
  canAutoComplete,
  isWon,
} from "../../src/engine/state.ts";
import { invariantViolations, makeState } from "./helpers.ts";

const token = (move: Move | null) => (move === null ? null : encodeMove(move));

describe("hints", () => {
  it("prefer the move that turns a card over", () => {
    const state = makeState({
      foundations: "A♥",
      tableau: ["9♦", "A♣ | 8♠", "5♠ 4♥ 3♠ 2♥"],
    });
    assert.equal(token(hint(state)), "t1t0x1");
  });

  it("would rather not empty a column with no King to fill it", () => {
    const state = makeState({
      foundations: "A♥",
      tableau: ["9♦", "8♠", "5♠ 4♥ 3♠ 2♥"],
    });
    assert.equal(token(hint(state)), "t2f");
  });

  it("empties it once a King is ready", () => {
    const state = makeState({
      foundations: "A♥",
      tableau: ["9♦", "8♠", "5♠ 4♥ 3♠ 2♥"],
      waste: "K♥",
    });
    assert.equal(token(hint(state)), "t1t0x1");
  });

  /**
   * Sending a card home too early strands a run that still wants to build on
   * it. 5♦ is safe because both black fours are already home and nothing can
   * ever need it again; 5♣ is not, because 4♥ is still out there. Asserted
   * both ways round so it is the ranking being tested and not the order the
   * moves happen to be enumerated in.
   */
  it("hold back a card the tableau might still want", () => {
    const columns = ["5♦", "5♣"];
    assert.equal(
      token(hint(makeState({ foundations: "4♦ 4♣ 4♠ 2♥", tableau: columns }))),
      "t0f",
    );
    assert.equal(
      token(
        hint(
          makeState({
            foundations: "4♦ 4♣ 4♠ 2♥",
            tableau: [...columns].reverse(),
          }),
        ),
      ),
      "t1f",
    );
  });

  it("say to turn the stock when only the stock can help", () => {
    const state = makeState({ stock: "A♠ 2♥", tableau: ["5♥"] });
    assert.equal(token(hint(state)), "d");
  });

  it("say to turn it over when the answer is a pass away", () => {
    const state = makeState({ waste: "A♠ 5♠", tableau: ["9♦"] });
    assert.equal(token(hint(state)), "r");
  });

  // Not "you lose" — there is no such state. The UI says so plainly and the
  // player undoes, or takes a new deal.
  it("admit it when there is nothing", () => {
    assert.equal(hint(makeState({ tableau: ["9♦", "8♥"] })), null);
    assert.equal(
      hint(makeState({ stock: "5♥ 6♥", tableau: ["9♦", "8♥"] })),
      null,
      "no rotation of the stock produces a move",
    );
  });

  it("never suggest moving a hole from one column to another", () => {
    assert.equal(hint(makeState({ tableau: ["", "K♠ Q♥"] })), null);
  });

  it("never suggest taking a card back off a foundation", () => {
    assert.equal(hint(makeState({ foundations: "2♦", tableau: ["3♠"] })), null);
  });

  it("only ever suggest a legal move", () => {
    const pick = mulberry32(0x11117);
    for (let game = 0; game < 30; game++) {
      let state = deal(pick(), pick() % 2 === 0 ? 1 : 3);
      for (let step = 0; step < 80; step++) {
        const suggestion = hint(state);
        if (suggestion !== null) {
          assert.ok(
            legalMoves(state).some(
              (m) => encodeMove(m) === encodeMove(suggestion),
            ),
            `hinted ${encodeMove(suggestion)}, which is not legal`,
          );
        }
        const moves = legalMoves(state);
        if (moves.length === 0) break;
        state = applyMove(state, moves[pick() % moves.length] as Move);
      }
    }
  });
});

/**
 * A board at the moment Finish appears: every card face up, the tableau in
 * descending runs, and some cards possibly still in the stock. Built by
 * dealing a won game back out through legal moves, then lifting cards off the
 * tops of the runs into the stock — which is exactly the shape a real game
 * arrives in, and lets the corpus be swept rather than hand-written.
 */
function endgame(
  seed: number,
  drawCount: DrawCount,
  handOut: number,
  toStock: number,
): GameState {
  const pick = mulberry32(seed);
  let state = makeState({ foundations: "K♣ K♦ K♥ K♠", drawCount });
  for (let i = 0; i < handOut; i++) {
    const back = legalMoves(state).filter(
      (move) => move.kind === "foundationToTableau",
    );
    if (back.length === 0) break;
    state = applyMove(state, back[pick() % back.length] as Move);
  }

  state = structuredClone(state);
  for (let i = 0; i < toStock; i++) {
    const columns = state.tableau.filter((column) => column.cards.length > 0);
    if (columns.length === 0) break;
    const column = columns[pick() % columns.length]!;
    state.stock.splice(
      pick() % (state.stock.length + 1),
      0,
      column.cards.pop()!,
    );
  }
  return state;
}

/** Replay a finishing run through the real rules. It throws if any move is illegal. */
function replay(state: GameState, sequence: Move[]): GameState {
  return sequence.reduce(applyMove, state);
}

const SHAPES: Array<[handOut: number, toStock: number]> = [
  [20, 0],
  [30, 0],
  [40, 0],
  [30, 3],
  [40, 8],
  [45, 12],
];

describe("finishing the game", () => {
  it("is offered exactly when no face-down cards remain", () => {
    assert.equal(canAutoComplete(deal(42, 1)), false, "a fresh deal");
    assert.equal(
      canAutoComplete(endgame(1, 1, 30, 0)),
      true,
      "everything face up",
    );
    assert.equal(
      canAutoComplete(makeState({ foundations: "K♣ K♦ K♥ K♠" })),
      false,
      "an already-won game has nothing to finish",
    );
    assert.deepEqual(
      autoCompleteSequence(makeState({ foundations: "K♣ K♦ K♥ K♠" })),
      [],
    );
  });

  it("sends every card home from any position with an empty stock", () => {
    for (const drawCount of [1, 3] as const) {
      for (const [handOut] of SHAPES) {
        for (let seed = 1; seed <= 25; seed++) {
          const start = endgame(seed, drawCount, handOut, 0);
          assert.deepEqual(invariantViolations(start), []);
          const finished = replay(start, autoCompleteSequence(start));
          assert.ok(
            isWon(finished),
            `draw-${drawCount} seed ${seed} handing out ${handOut} did not finish`,
          );
        }
      }
    }
  });

  it("sends every card home in draw-1, whatever is left in the stock", () => {
    for (const [handOut, toStock] of SHAPES) {
      for (let seed = 1; seed <= 25; seed++) {
        const start = endgame(seed, 1, handOut, toStock);
        assert.deepEqual(invariantViolations(start), []);
        const finished = replay(start, autoCompleteSequence(start));
        assert.ok(
          isWon(finished),
          `seed ${seed}, ${handOut} out and ${toStock} in the stock, did not finish`,
        );
      }
    }
  });

  /**
   * Draw-3 can pin a needed card under one with nowhere to go, in a rotation
   * that never exposes it. The engine's promise is not that it always wins —
   * it is that what it returns is always legal, always leaves the board
   * coherent, and never pretends. The caller checks `isWon` before offering
   * the button.
   */
  it("always returns a legal run, even where draw-3 defeats it", () => {
    let finished = 0;
    let total = 0;
    for (const [handOut, toStock] of SHAPES) {
      for (let seed = 1; seed <= 25; seed++) {
        const start = endgame(seed, 3, handOut, toStock);
        const end = replay(start, autoCompleteSequence(start));
        assert.deepEqual(invariantViolations(end), [], `seed ${seed}`);
        total++;
        if (isWon(end)) finished++;
      }
    }
    assert.ok(
      finished > total * 0.8,
      `only ${finished} of ${total} draw-3 endgames finished`,
    );
  });

  // Lowest rank first, so the cascade climbs the four piles together instead
  // of finishing one suit and then starting the next.
  it("climbs the foundations rather than jumping about", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const start = endgame(seed, 1, 35, 0);
      let state = start;
      let sent = 0;
      let previous = 0;
      for (const move of autoCompleteSequence(start)) {
        const before = state.foundations.map((pile) => pile.length);
        state = applyMove(state, move);
        const grew = state.foundations.findIndex(
          (pile, suit) => pile.length > (before[suit] as number),
        );
        if (grew < 0) continue;
        const rank = (before[grew] as number) + 1;
        assert.ok(rank >= previous, `rank ${rank} came after ${previous}`);
        previous = rank;
        sent++;
      }
      assert.ok(isWon(state));
      assert.equal(sent, 52 - start.foundations.flat().length);
    }
  });
});
