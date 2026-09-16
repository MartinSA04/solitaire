import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type Card,
  DECK_SIZE,
  TABLEAU_CARDS,
  TABLEAU_COLUMNS,
  applyMove,
  deal,
  shuffledDeck,
} from "../../src/engine/index.ts";
import {
  dealOrder,
  drawnCards,
  homedCard,
  predealt,
} from "../../src/game/motion.ts";
import { makeState, parseCards } from "../engine/helpers.ts";

/**
 * The move catalogue's two staggered motions read their order from here, and
 * the deal reads the board it flies out of from here, so all three are pinned
 * without a browser. What the cards then *look* like doing it is CSS, and is
 * e2e/board.pw.ts's problem.
 */

const SEED = 24;

describe("dealOrder", () => {
  it("is the deck, in the order deal() laid it out", () => {
    const order = dealOrder(deal(SEED, 1));
    const deck = shuffledDeck(SEED).slice(0, TABLEAU_CARDS);
    assert.deepEqual(order, deck);
  });

  it("covers the tableau exactly once", () => {
    const order = dealOrder(deal(SEED, 1));
    assert.equal(order.length, TABLEAU_CARDS);
    assert.equal(new Set(order).size, TABLEAU_CARDS);
  });

  it("deals a row at a time, not a column at a time", () => {
    const state = deal(SEED, 1);
    const order = dealOrder(state);

    // The first seven are the bottom card of each column, left to right: that
    // is the difference between a deal and twenty-eight draws.
    const bottoms = state.tableau.map((column) => column.cards[0] as Card);
    assert.deepEqual(order.slice(0, TABLEAU_COLUMNS), bottoms);

    // The last is the card that finishes the rightmost column, which is also
    // the last card turned face up.
    const rightmost = state.tableau[TABLEAU_COLUMNS - 1] as { cards: Card[] };
    assert.equal(order[order.length - 1], rightmost.cards[TABLEAU_COLUMNS - 1]);
  });
});

describe("predealt", () => {
  it("puts every card back on the stock, face down", () => {
    const before = predealt(deal(SEED, 1));

    assert.equal(before.stock.length, DECK_SIZE);
    assert.equal(new Set(before.stock).size, DECK_SIZE);
    assert.deepEqual(before.waste, []);
    assert.deepEqual(before.foundations, [[], [], [], []]);
    assert.equal(
      before.tableau.filter((column) => column.cards.length > 0).length,
      0,
    );
  });

  it("holds the whole deck whatever board it is given", () => {
    // It is only ever called on a fresh deal, but a board missing cards would
    // leave holes in the placements and take the card layer down with it.
    const played = applyMove(deal(SEED, 3), { kind: "draw" });
    const state = applyMove(played, { kind: "draw" });
    assert.equal(predealt(state).stock.length, DECK_SIZE);
  });

  it("is the same deal, only undealt", () => {
    const state = deal(SEED, 3);
    const before = predealt(state);
    assert.equal(before.seed, state.seed);
    assert.equal(before.drawCount, state.drawCount);
    assert.equal(before.moves, state.moves);
  });
});

describe("homedCard", () => {
  it("is the card a tableau move is about to send home", () => {
    const state = makeState({ tableau: ["K♠ | A♥"] });
    assert.equal(
      homedCard(state, { kind: "tableauToFoundation", from: 0 }),
      parseCards("A♥")[0],
    );
  });

  it("is the top of the waste, not the bottom of it", () => {
    const state = makeState({ waste: "9♣ A♦" });
    assert.equal(
      homedCard(state, { kind: "wasteToFoundation" }),
      parseCards("A♦")[0],
    );
  });

  it("is nothing for a move that goes anywhere else", () => {
    const state = deal(SEED, 1);
    assert.equal(homedCard(state, { kind: "draw" }), null);
    assert.equal(homedCard(state, { kind: "recycle" }), null);
    assert.equal(
      homedCard(state, { kind: "tableauToTableau", from: 0, to: 1, count: 1 }),
      null,
    );
    // Coming back *off* a foundation is an ordinary move, and sounds like one.
    assert.equal(
      homedCard(state, { kind: "foundationToTableau", suit: 0, to: 1 }),
      null,
    );
  });

  it("is nothing when there is no card to send", () => {
    const empty = makeState({});
    assert.equal(homedCard(empty, { kind: "wasteToFoundation" }), null);
    assert.equal(
      homedCard(empty, { kind: "tableauToFoundation", from: 3 }),
      null,
    );
  });
});

describe("drawnCards", () => {
  it("is the one card a draw-1 turned over", () => {
    const before = deal(SEED, 1);
    const after = applyMove(before, { kind: "draw" });
    assert.deepEqual(drawnCards(before, after), [before.stock[0]]);
  });

  it("is three, oldest first, in draw-3", () => {
    const before = deal(SEED, 3);
    const after = applyMove(before, { kind: "draw" });
    assert.deepEqual(drawnCards(before, after), before.stock.slice(0, 3));
  });

  it("is however few the stock had left", () => {
    const before = makeState({ stock: "5♠ 9♦", drawCount: 3 });
    const after = applyMove(before, { kind: "draw" });
    assert.deepEqual(drawnCards(before, after), parseCards("5♠ 9♦"));
  });

  it("is nothing at all when no card was turned", () => {
    const state = deal(SEED, 1);
    assert.deepEqual(drawnCards(state, state), []);
  });
});
