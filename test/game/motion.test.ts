import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type Card,
  CLUBS,
  DECK_SIZE,
  HEARTS,
  TABLEAU_CARDS,
  TABLEAU_COLUMNS,
  applyMove,
  deal,
  hint,
  shuffledDeck,
} from "../../src/engine/index.ts";
import {
  dealOrder,
  drawnCards,
  hintOf,
  homedCard,
  predealt,
} from "../../src/game/motion.ts";
import { makeState, parseCards, showCards } from "../engine/helpers.ts";

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
    // A resumed game is a board mid-play, and one missing cards leaves holes in
    // the placements and takes the card layer down with it.
    //
    // Drawing is not enough to catch that, and neither is sending a card home:
    // both leave the tableau a triangle, which is the one shape the deal order
    // can rebuild on its own. A card landing on a *shorter* column is what
    // breaks it — it sits below the row the triangle has for that column, and
    // the undealt board is then fifty-one cards. So this plays a real game.
    // Hints alone will draw round the stock forever once the real moves run
    // out, so this is a hundred moves of a game rather than a whole one.
    let state = deal(SEED, 1);
    for (let played = 0; played < 100; played++) {
      const move = hint(state);
      if (move === null) break;
      state = applyMove(state, move);
      const before = predealt(state);
      assert.equal(before.stock.length, DECK_SIZE);
      assert.equal(new Set(before.stock).size, DECK_SIZE);
    }
    // And the columns did change shape, or the loop above proved nothing.
    assert.notDeepEqual(
      state.tableau.map((column) => column.cards.length),
      [1, 2, 3, 4, 5, 6, 7],
    );
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

describe("hintOf", () => {
  const CLUBS_PILE = { pile: "foundation", suit: CLUBS } as const;
  const HEARTS_PILE = { pile: "foundation", suit: HEARTS } as const;

  it("is the cards that move and the pile they move onto", () => {
    const state = makeState({ tableau: ["7♥", "K♠ | 6♠"] });
    const hint = hintOf(state, {
      kind: "tableauToTableau",
      from: 1,
      to: 0,
      count: 1,
    });
    assert.equal(showCards(hint.cards), "6♠");
    assert.deepEqual(hint.to, { pile: "tableau", column: 0 });
  });

  /**
   * The whole run, not the card at the bottom of it. What is being pointed at
   * is the thing that would move, and three cards travelling together are one
   * thing.
   */
  it("takes the whole run when a run is what moves", () => {
    const state = makeState({ tableau: ["9♠", "K♦ | 8♥ 7♣ 6♦"] });
    const hint = hintOf(state, {
      kind: "tableauToTableau",
      from: 1,
      to: 0,
      count: 3,
    });
    assert.equal(showCards(hint.cards), "8♥ 7♣ 6♦");
    assert.deepEqual(hint.to, { pile: "tableau", column: 0 });
  });

  it("names the suit's foundation, whether or not anything is on it", () => {
    const onto = makeState({ foundations: "A♥", tableau: ["K♠ | 2♥"] });
    const full = hintOf(onto, { kind: "tableauToFoundation", from: 0 });
    assert.equal(showCards(full.cards), "2♥");
    assert.deepEqual(full.to, HEARTS_PILE);

    // The case the old two-cards-and-nothing-else hint could not express: an
    // empty destination is a pile, and a pile can be lit up.
    const empty = makeState({ tableau: ["K♠ | A♥"] });
    const bare = hintOf(empty, { kind: "tableauToFoundation", from: 0 });
    assert.equal(showCards(bare.cards), "A♥");
    assert.deepEqual(bare.to, HEARTS_PILE);
  });

  it("names an empty column as the destination", () => {
    const state = makeState({ tableau: ["", "Q♦ | K♣"] });
    const hint = hintOf(state, {
      kind: "tableauToTableau",
      from: 1,
      to: 0,
      count: 1,
    });
    assert.equal(showCards(hint.cards), "K♣");
    assert.deepEqual(hint.to, { pile: "tableau", column: 0 });
  });

  it("points a draw at the waste and a recycle at the stock", () => {
    const state = makeState({ stock: "4♣ 5♣", waste: "9♦ 3♥" });
    const draw = hintOf(state, { kind: "draw" });
    assert.equal(showCards(draw.cards), "4♣");
    assert.deepEqual(draw.to, { pile: "waste" });

    // The one card of the waste you can actually see goes back under the
    // stock, and the stock is where the hint is pointing.
    const recycle = hintOf(makeState({ waste: "9♦ 3♥" }), { kind: "recycle" });
    assert.equal(showCards(recycle.cards), "3♥");
    assert.deepEqual(recycle.to, { pile: "stock" });
  });

  it("brings a card back off a foundation, into a named column", () => {
    const state = makeState({ foundations: "A♣ 2♣", tableau: ["K♠ | 3♥"] });
    const hint = hintOf(state, {
      kind: "foundationToTableau",
      suit: CLUBS,
      to: 0,
    });
    assert.equal(showCards(hint.cards), "2♣");
    assert.deepEqual(hint.to, { pile: "tableau", column: 0 });
  });

  it("still names a pile when there is nothing anywhere to point at", () => {
    // A hint is only ever asked for a move the engine found, so these cannot
    // happen in the game — but a destination that is always a pile is the
    // whole point of the shape, and it has to hold on an empty board too.
    assert.deepEqual(hintOf(makeState({}), { kind: "draw" }), {
      cards: [],
      to: { pile: "waste" },
    });
    assert.deepEqual(hintOf(makeState({}), { kind: "recycle" }), {
      cards: [],
      to: { pile: "stock" },
    });
    assert.deepEqual(hintOf(makeState({}), { kind: "wasteToTableau", to: 2 }), {
      cards: [],
      to: { pile: "tableau", column: 2 },
    });
    // Suit zero, because there is no card to take a suit from — and clubs is
    // as good a nothing as any, since the cards list is empty either way.
    assert.deepEqual(hintOf(makeState({}), { kind: "wasteToFoundation" }), {
      cards: [],
      to: CLUBS_PILE,
    });
  });
});
