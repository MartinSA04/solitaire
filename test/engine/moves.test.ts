import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CLUBS, DIAMONDS, HEARTS, SPADES } from "../../src/engine/card.ts";
import { deal } from "../../src/engine/deal.ts";
import {
  type Move,
  IllegalMoveError,
  applyMove,
  decodeMove,
  encodeMove,
  isLegal,
} from "../../src/engine/moves.ts";
import { topOf } from "../../src/engine/state.ts";
import { makeState, parseCard, showCards, showColumn } from "./helpers.ts";

/**
 * Every rule in docs/02-game-spec.md, positively and negatively. The spec is
 * the contract; this file is where it is enforced.
 */

describe("foundations", () => {
  it("take an Ace onto an empty pile, from the tableau or the waste", () => {
    const state = makeState({ tableau: ["A♠", "5♥"], waste: "A♦" });
    assert.equal(
      isLegal(state, { kind: "tableauToFoundation", from: 0 }),
      true,
    );
    assert.equal(isLegal(state, { kind: "wasteToFoundation" }), true);
    assert.equal(
      isLegal(state, { kind: "tableauToFoundation", from: 1 }),
      false,
    );
  });

  it("build up in suit, one rank at a time", () => {
    const state = makeState({
      foundations: "A♠",
      tableau: ["2♠", "2♥", "3♠"],
    });
    assert.equal(
      isLegal(state, { kind: "tableauToFoundation", from: 0 }),
      true,
    );
    assert.equal(
      isLegal(state, { kind: "tableauToFoundation", from: 1 }),
      false,
      "wrong suit",
    );
    assert.equal(
      isLegal(state, { kind: "tableauToFoundation", from: 2 }),
      false,
      "skips a rank",
    );
  });

  it("refuse a move from an empty column", () => {
    const state = makeState({ tableau: [""] });
    assert.equal(
      isLegal(state, { kind: "tableauToFoundation", from: 0 }),
      false,
    );
  });

  it("refuse a move from an empty waste", () => {
    assert.equal(isLegal(makeState(), { kind: "wasteToFoundation" }), false);
  });

  // Allowed deliberately: it exists in the physical game, it is occasionally
  // necessary to win, and forbidding it only creates a trap.
  it("give cards back to the tableau", () => {
    const state = makeState({ foundations: "5♦", tableau: ["6♠", "6♥", ""] });
    const back: Move = { kind: "foundationToTableau", suit: DIAMONDS, to: 0 };
    assert.equal(isLegal(state, back), true);
    assert.equal(
      isLegal(state, { kind: "foundationToTableau", suit: DIAMONDS, to: 1 }),
      false,
      "same colour",
    );
    assert.equal(
      isLegal(state, { kind: "foundationToTableau", suit: DIAMONDS, to: 2 }),
      false,
      "only a King fills a space",
    );
    assert.equal(
      isLegal(state, { kind: "foundationToTableau", suit: CLUBS, to: 0 }),
      false,
      "that foundation is empty",
    );

    const after = applyMove(state, back);
    assert.equal(showCards(after.foundations[DIAMONDS] ?? []), "A♦ 2♦ 3♦ 4♦");
    assert.equal(showColumn(after.tableau[0]!), "6♠ 5♦");
  });
});

describe("tableau building", () => {
  it("takes a card one rank lower of the opposite colour", () => {
    const state = makeState({ tableau: ["8♠", "7♥", "7♠"] });
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 1, to: 0, count: 1 }),
      true,
    );
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 2, to: 0, count: 1 }),
      false,
      "same colour",
    );
  });

  it("refuses a rank that doesn't follow", () => {
    const state = makeState({ tableau: ["9♠", "7♥", "T♥"] });
    for (const from of [1, 2]) {
      assert.equal(
        isLegal(state, { kind: "tableauToTableau", from, to: 0, count: 1 }),
        false,
      );
    }
  });

  it("takes the waste's top card by the same rule", () => {
    const state = makeState({ tableau: ["8♠", "8♥"], waste: "9♦ 7♥" });
    assert.equal(isLegal(state, { kind: "wasteToTableau", to: 0 }), true);
    assert.equal(isLegal(state, { kind: "wasteToTableau", to: 1 }), false);
    assert.equal(
      isLegal(makeState({ tableau: ["8♠"] }), {
        kind: "wasteToTableau",
        to: 0,
      }),
      false,
      "empty waste",
    );
  });

  // The permissive "any card into a space" variant makes the game
  // substantially easier and is not what people mean by Klondike.
  it("only lets a King, or a run headed by one, into an empty column", () => {
    const state = makeState({ tableau: ["", "K♠", "Q♥", "K♦ Q♠ J♥"] });
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 1, to: 0, count: 1 }),
      true,
    );
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 2, to: 0, count: 1 }),
      false,
    );
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 3, to: 0, count: 3 }),
      true,
      "a King-headed run",
    );
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 3, to: 0, count: 2 }),
      false,
      "headed by a Queen",
    );
  });

  it("moves a properly sequenced run of any length as a unit", () => {
    const state = makeState({ tableau: ["9♦", "T♠ 9♥ 8♠ 7♥"] });
    const move: Move = { kind: "tableauToTableau", from: 1, to: 0, count: 2 };
    assert.equal(
      isLegal(state, move),
      true,
      "a partial run from within a sequence",
    );
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 1, to: 0, count: 3 }),
      false,
      "9♥ does not sit on 9♦",
    );

    const after = applyMove(state, move);
    assert.equal(showColumn(after.tableau[0]!), "9♦ 8♠ 7♥");
    assert.equal(showColumn(after.tableau[1]!), "T♠ 9♥");
  });

  it("refuses a run that isn't properly sequenced", () => {
    const state = makeState({ tableau: ["9♦", "8♠ 7♠"] });
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 1, to: 0, count: 2 }),
      false,
    );
  });

  it("never lets a face-down card move", () => {
    const state = makeState({ tableau: ["9♦", "A♣ T♦ | 8♠ 7♥"] });
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 1, to: 0, count: 2 }),
      true,
    );
    assert.equal(
      isLegal(state, { kind: "tableauToTableau", from: 1, to: 0, count: 3 }),
      false,
      "would take a face-down card",
    );
  });

  it("refuses nonsense parameters", () => {
    const state = makeState({ tableau: ["8♠", "7♥"] });
    const cases: Move[] = [
      { kind: "tableauToTableau", from: 1, to: 1, count: 1 },
      { kind: "tableauToTableau", from: 1, to: 0, count: 0 },
      { kind: "tableauToTableau", from: 1, to: 0, count: -1 },
      { kind: "tableauToTableau", from: 1, to: 0, count: 1.5 },
      { kind: "tableauToTableau", from: 7, to: 0, count: 1 },
      { kind: "tableauToTableau", from: 1, to: -1, count: 1 },
      { kind: "tableauToFoundation", from: 9 },
      { kind: "wasteToTableau", to: 7 },
      { kind: "foundationToTableau", suit: 4 as never, to: 0 },
    ];
    for (const move of cases) {
      assert.equal(isLegal(state, move), false, encodeMove(move));
    }
  });
});

describe("turning cards over", () => {
  it("flips the newly exposed card, as part of the move that exposed it", () => {
    const state = makeState({ tableau: ["9♦", "A♣ T♦ | 8♠"] });
    const after = applyMove(state, {
      kind: "tableauToTableau",
      from: 1,
      to: 0,
      count: 1,
    });
    assert.equal(showColumn(after.tableau[1]!), "A♣ | T♦");
  });

  it("flips after a move to a foundation too", () => {
    const state = makeState({ tableau: ["A♣ | A♠"] });
    const after = applyMove(state, { kind: "tableauToFoundation", from: 0 });
    assert.equal(showColumn(after.tableau[0]!), "A♣");
  });

  it("flips nothing while face-up cards remain", () => {
    const state = makeState({ tableau: ["9♦", "A♣ | 9♠ 8♠"] });
    const after = applyMove(state, {
      kind: "tableauToTableau",
      from: 1,
      to: 0,
      count: 1,
    });
    assert.equal(showColumn(after.tableau[1]!), "A♣ | 9♠");
  });

  it("flips nothing when the column empties", () => {
    const state = makeState({ tableau: ["A♠"] });
    const after = applyMove(state, { kind: "tableauToFoundation", from: 0 });
    assert.deepEqual(after.tableau[0], { cards: [], down: 0 });
  });

  it("never flips the column a card lands on", () => {
    const state = makeState({ tableau: ["A♣ | 9♦", "8♠"] });
    const after = applyMove(state, {
      kind: "tableauToTableau",
      from: 1,
      to: 0,
      count: 1,
    });
    assert.equal(showColumn(after.tableau[0]!), "A♣ | 9♦ 8♠");
  });
});

describe("stock and waste", () => {
  it("turns one card in draw-1", () => {
    const state = makeState({ stock: "A♠ 2♠ 3♠", drawCount: 1 });
    const after = applyMove(state, { kind: "draw" });
    assert.equal(showCards(after.stock), "2♠ 3♠");
    assert.equal(showCards(after.waste), "A♠");
  });

  it("turns three in draw-3, of which only the last is playable", () => {
    const state = makeState({ stock: "A♠ 2♥ 3♦ 4♠", drawCount: 3 });
    const after = applyMove(state, { kind: "draw" });
    assert.equal(showCards(after.stock), "4♠");
    assert.equal(showCards(after.waste), "A♠ 2♥ 3♦");
    assert.equal(topOf(after.waste), parseCard("3♦"));
    assert.equal(
      isLegal(after, { kind: "wasteToFoundation" }),
      false,
      "the buried Ace is not reachable",
    );
  });

  it("turns what is left when the stock is nearly out", () => {
    const state = makeState({ stock: "A♠ 2♠", drawCount: 3 });
    const after = applyMove(state, { kind: "draw" });
    assert.deepEqual(after.stock, []);
    assert.equal(showCards(after.waste), "A♠ 2♠");
  });

  it("refuses to draw from an empty stock", () => {
    assert.equal(isLegal(makeState({ waste: "A♠" }), { kind: "draw" }), false);
  });

  it("recycles the whole waste, in order, and only when the stock is out", () => {
    const state = makeState({ waste: "A♠ 2♠ 3♠" });
    const after = applyMove(state, { kind: "recycle" });
    assert.equal(showCards(after.stock), "A♠ 2♠ 3♠");
    assert.deepEqual(after.waste, []);

    assert.equal(
      isLegal(makeState({ stock: "4♠", waste: "A♠" }), { kind: "recycle" }),
      false,
      "the stock still has cards",
    );
    assert.equal(
      isLegal(makeState(), { kind: "recycle" }),
      false,
      "nothing to recycle",
    );
  });

  // Redeals are unlimited, and a redeal never reshuffles: the stock's sequence
  // is fixed at deal time, which is the whole of what makes draw-3 a game of
  // counting rather than of luck twice over.
  it("comes back round to exactly the same stock, as many times as you like", () => {
    const start = deal(1337, 3);
    let state = start;
    for (let pass = 0; pass < 3; pass++) {
      while (state.stock.length > 0) state = applyMove(state, { kind: "draw" });
      state = applyMove(state, { kind: "recycle" });
      assert.deepEqual(state.stock, start.stock, `after pass ${pass + 1}`);
    }
  });
});

describe("applyMove", () => {
  it("counts the move", () => {
    const state = makeState({ stock: "A♠", moves: 4 });
    assert.equal(applyMove(state, { kind: "draw" }).moves, 5);
  });

  it("throws on an illegal move", () => {
    assert.throws(
      () => applyMove(makeState(), { kind: "draw" }),
      IllegalMoveError,
    );
  });

  it("leaves the state it was given alone", () => {
    const state = deal(42, 1);
    const before = structuredClone(state);
    applyMove(state, { kind: "draw" });
    assert.deepEqual(state, before);
  });

  it("shares the piles it didn't touch", () => {
    const state = deal(42, 1);
    const drawn = applyMove(state, { kind: "draw" });
    assert.equal(
      drawn.tableau,
      state.tableau,
      "a draw leaves the tableau alone",
    );
    assert.equal(drawn.foundations, state.foundations);

    const moved = applyMove(drawn, {
      kind: "tableauToTableau",
      from: 6,
      to: 0,
      count: 1,
    });
    assert.equal(
      moved.stock,
      drawn.stock,
      "a tableau move leaves the stock alone",
    );
    assert.equal(
      moved.tableau[1],
      drawn.tableau[1],
      "untouched columns are shared",
    );
  });
});

describe("move tokens", () => {
  const moves: Move[] = [
    { kind: "draw" },
    { kind: "recycle" },
    { kind: "wasteToFoundation" },
    { kind: "wasteToTableau", to: 6 },
    { kind: "tableauToFoundation", from: 3 },
    { kind: "tableauToTableau", from: 0, to: 6, count: 13 },
    { kind: "tableauToTableau", from: 5, to: 1, count: 1 },
    { kind: "foundationToTableau", suit: HEARTS, to: 2 },
    { kind: "foundationToTableau", suit: SPADES, to: 0 },
  ];

  it("round-trip", () => {
    for (const move of moves) {
      assert.deepEqual(decodeMove(encodeMove(move)), move, encodeMove(move));
    }
  });

  it("are short enough for a save file", () => {
    for (const move of moves) {
      assert.ok(encodeMove(move).length <= 7, encodeMove(move));
    }
  });

  // A save file is untrusted input: it holds whatever a user last pasted in.
  it("reject anything unrecognised", () => {
    const junk = [
      "",
      "x",
      "t7f",
      "wt9",
      "t0t0x0",
      "t0t1x14",
      "f4t0",
      "dd",
      " d",
    ];
    for (const token of junk) {
      assert.equal(decodeMove(token), null, JSON.stringify(token));
    }
  });
});
