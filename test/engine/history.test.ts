import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deal } from "../../src/engine/deal.ts";
import { legalMoves } from "../../src/engine/enumerate.ts";
import {
  canUndo,
  createHistory,
  currentState,
  record,
  rewind,
  undo,
} from "../../src/engine/history.ts";
import { type Move, applyMove } from "../../src/engine/moves.ts";
import { mulberry32 } from "../../src/engine/rng.ts";
import { newGame } from "../../src/engine/index.ts";

describe("history", () => {
  it("starts at the deal", () => {
    const start = deal(7, 1);
    const history = createHistory(start);
    assert.equal(currentState(history), start);
    assert.equal(canUndo(history), false);
    assert.equal(undo(history), false);
  });

  /**
   * The reason undo stores whole states rather than inverting moves: turnover
   * is lossy, and a move doesn't record whether it caused a flip. Byte-identical
   * is the bar, at every depth.
   */
  it("reproduces every earlier position exactly", () => {
    const pick = mulberry32(0x0d0);
    const start = deal(1337, 3);
    const history = createHistory(start);
    const snapshots = [structuredClone(start)];

    for (let step = 0; step < 150; step++) {
      const state = currentState(history);
      const moves = legalMoves(state);
      if (moves.length === 0) break;
      record(history, applyMove(state, moves[pick() % moves.length] as Move));
      snapshots.push(structuredClone(currentState(history)));
    }

    for (let depth = snapshots.length - 1; depth >= 0; depth--) {
      assert.deepEqual(
        currentState(history),
        snapshots[depth],
        `depth ${depth}`,
      );
      assert.equal(undo(history), depth > 0);
    }
    assert.equal(canUndo(history), false);
  });

  it("rewinds to the deal in one step", () => {
    const start = deal(42, 1);
    const history = createHistory(start);
    record(history, applyMove(start, { kind: "draw" }));
    record(history, applyMove(currentState(history), { kind: "draw" }));
    rewind(history);
    assert.equal(currentState(history), start);
    assert.equal(canUndo(history), false);
  });
});

describe("undo through a game", () => {
  it("takes the board back but not the record of what you did", () => {
    const game = newGame(42, 1);
    const dealt = structuredClone(game.state);

    let played = 0;
    const pick = mulberry32(0xbeef);
    for (let step = 0; step < 60; step++) {
      const moves = legalMoves(game.state);
      if (moves.length === 0) break;
      assert.equal(game.play(moves[pick() % moves.length] as Move), true);
      played++;
    }
    assert.equal(game.movesPlayed, played);
    assert.equal(game.state.moves, played);

    while (game.undo());
    assert.deepEqual(game.state, dealt, "the board is back at the deal");
    assert.equal(game.state.moves, 0);
    assert.equal(
      game.movesPlayed,
      played,
      "undo forgives the board, not the move count",
    );
    assert.equal(game.canUndo, false);
  });

  it("refuses an illegal move without disturbing anything", () => {
    const game = newGame(42, 1);
    const before = structuredClone(game.state);
    assert.equal(game.play({ kind: "recycle" }), false);
    assert.deepEqual(game.state, before);
    assert.equal(game.movesPlayed, 0);
    assert.equal(game.canUndo, false);
  });

  it("replays the deal from the start", () => {
    const game = newGame(1337, 1);
    const dealt = structuredClone(game.state);
    game.play({ kind: "draw" });
    game.play({ kind: "draw" });
    game.restart();
    assert.deepEqual(game.state, dealt);
    assert.equal(game.movesPlayed, 0);
    assert.equal(game.canUndo, false);
  });
});
