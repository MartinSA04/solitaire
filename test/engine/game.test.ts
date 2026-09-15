import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deal } from "../../src/engine/deal.ts";
import { legalMoves } from "../../src/engine/enumerate.ts";
import { type Move, encodeMove } from "../../src/engine/moves.ts";
import { mulberry32 } from "../../src/engine/rng.ts";
import { deserialise, fromSeedUrl, newGame } from "../../src/engine/index.ts";

describe("newGame", () => {
  it("deals the seed it is given, draw-1 unless told otherwise", () => {
    const game = newGame(4811209);
    assert.deepEqual(game.state, deal(4811209, 1));
    assert.equal(game.seed, 4811209);
    assert.equal(game.drawCount, 1);
    assert.equal(newGame(7, 3).drawCount, 3);
  });

  it("refuses a deal number that isn't a uint32", () => {
    for (const bad of [-1, 1.5, NaN, 2 ** 32]) {
      assert.throws(() => newGame(bad), RangeError, `${bad}`);
    }
  });

  it("starts unfinished, with nothing to undo", () => {
    const game = newGame(1);
    assert.equal(game.isWon, false);
    assert.equal(game.canUndo, false);
    assert.equal(game.canAutoComplete, false);
    assert.equal(game.movesPlayed, 0);
  });
});

describe("a deal in a URL", () => {
  const parse = (query: string) => fromSeedUrl(new URLSearchParams(query));

  it("deals exactly that game", () => {
    const game = parse("deal=1234567");
    assert.deepEqual(game?.state, deal(1234567, 1));
    assert.equal(parse("deal=1234567&draw=3")?.drawCount, 3);
    assert.equal(parse("deal=0")?.seed, 0);
    assert.equal(parse("deal=4294967295")?.seed, 4294967295);
  });

  // A mistyped URL falls back to a fresh deal. It is not worth an error page.
  it("declines anything it can't honour", () => {
    const bad = [
      "",
      "deal=",
      "deal=-1",
      "deal=1.5",
      "deal=abc",
      "deal=4294967296",
      "deal=99999999999999",
      "deal=1&draw=2",
      "draw=3",
    ];
    for (const query of bad) {
      assert.equal(parse(query), null, JSON.stringify(query));
    }
  });
});

describe("saving and restoring", () => {
  function playSome(seed: number, count: number) {
    const game = newGame(seed, 3);
    const pick = mulberry32(seed);
    const played: Move[] = [];
    for (let step = 0; step < count; step++) {
      const moves = legalMoves(game.state);
      if (moves.length === 0) break;
      const move = moves[pick() % moves.length] as Move;
      game.play(move);
      played.push(move);
    }
    return { game, played };
  }

  it("is a seed and a move list", () => {
    const { game, played } = playSome(4811209, 12);
    const saved = JSON.parse(game.serialise());
    assert.deepEqual(saved, {
      v: 1,
      seed: 4811209,
      draw: 3,
      moves: played.map(encodeMove),
      played: played.length,
    });
  });

  it("comes back as the same position", () => {
    const { game } = playSome(1337, 40);
    const restored = deserialise(game.serialise());
    assert.deepEqual(restored?.state, game.state);
    assert.equal(restored?.movesPlayed, game.movesPlayed);
  });

  it("brings the undo stack back with it", () => {
    const { game } = playSome(99, 30);
    const restored = deserialise(game.serialise());
    assert.ok(restored);
    for (let step = 0; step < 30; step++) {
      assert.equal(restored.undo(), game.undo(), `undo ${step}`);
      assert.deepEqual(restored.state, game.state);
    }
    assert.equal(restored.canUndo, false);
  });

  it("keeps the move count across undos", () => {
    const { game } = playSome(5, 20);
    game.undo();
    game.undo();
    const restored = deserialise(game.serialise());
    assert.equal(restored?.movesPlayed, 20);
    assert.equal(restored?.state.moves, 18);
    assert.deepEqual(restored?.state, game.state);
  });

  // Storage holds whatever a user last pasted into it. A corrupt save is a new
  // game, never an error dialog.
  it("returns null for anything it can't replay", () => {
    const { game } = playSome(7, 10);
    const good = JSON.parse(game.serialise());
    const corrupt: unknown[] = [
      "",
      "{",
      "null",
      "[]",
      '"a string"',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, seed: -1 }),
      JSON.stringify({ ...good, seed: "1" }),
      JSON.stringify({ ...good, draw: 2 }),
      JSON.stringify({ ...good, moves: "d,d,d" }),
      JSON.stringify({ ...good, moves: [...good.moves, "nonsense"] }),
      JSON.stringify({ ...good, moves: [...good.moves, 7] }),
      JSON.stringify({ ...good, moves: ["t0t1x5", ...good.moves] }),
    ];
    for (const saved of corrupt) {
      assert.equal(
        deserialise(saved as string),
        null,
        String(saved).slice(0, 60),
      );
    }
  });

  it("ignores a move count that makes no sense, rather than refusing the save", () => {
    const { game } = playSome(11, 8);
    const good = JSON.parse(game.serialise());
    for (const played of [undefined, "lots", 1.5, 3]) {
      const restored = deserialise(JSON.stringify({ ...good, played }));
      assert.equal(restored?.movesPlayed, 8, String(played));
    }
    assert.equal(
      deserialise(JSON.stringify({ ...good, played: 40 }))?.movesPlayed,
      40,
      "a count above the replayed moves is the honest record of undos",
    );
  });
});
