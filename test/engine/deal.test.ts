import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DECK_SIZE, cardName } from "../../src/engine/card.ts";
import {
  STOCK_CARDS,
  TABLEAU_CARDS,
  deal,
  isSeed,
} from "../../src/engine/deal.ts";
import { TABLEAU_COLUMNS } from "../../src/engine/state.ts";
import { invariantViolations, showCards } from "./helpers.ts";

/**
 * The golden deals. Frozen at first release and never changed: players share
 * deal numbers, saved games are a seed plus a move list, and bests are keyed
 * by seed, so a changed shuffle silently invalidates all three. A failure here
 * means the engine changed, not that the fixture is stale.
 *
 * Columns are written bottom → top; all but the last card of each are face
 * down.
 */
const GOLDEN_DEALS = [
  {
    seed: 0,
    tableau: [
      "3♦",
      "Q♥ T♥",
      "K♦ K♠ 8♦",
      "T♠ 9♥ J♠ 9♣",
      "9♠ Q♣ 8♥ 6♥ 5♥",
      "2♥ 5♣ K♥ J♦ T♣ 2♠",
      "J♣ 9♦ 8♠ 7♦ 6♠ 7♥ 4♦",
    ],
    stock:
      "7♠ 3♠ 8♣ 5♠ 2♣ 3♣ 4♥ 4♠ Q♦ Q♠ A♣ 4♣ A♥ 2♦ 6♣ A♦ 5♦ A♠ T♦ J♥ K♣ 7♣ 3♥ 6♦",
  },
  {
    seed: 1,
    tableau: [
      "9♣",
      "A♣ 5♠",
      "T♣ K♠ 6♣",
      "4♣ 5♣ 9♥ K♥",
      "8♥ Q♦ J♦ J♣ 8♦",
      "T♦ 6♥ T♥ 7♦ 3♥ 2♦",
      "2♣ A♦ 6♠ A♥ 9♠ 6♦ K♦",
    ],
    stock:
      "Q♠ 5♦ 8♠ Q♣ T♠ 8♣ 3♠ 5♥ 9♦ 3♣ 4♥ 4♠ 7♥ 7♣ J♠ 4♦ 2♠ K♣ A♠ 2♥ J♥ Q♥ 7♠ 3♦",
  },
  {
    seed: 2,
    tableau: [
      "T♦",
      "J♣ K♠",
      "Q♣ J♠ 9♣",
      "A♠ Q♦ 9♥ 3♠",
      "A♥ 6♣ 4♦ 4♥ A♣",
      "5♣ 4♠ 6♠ Q♥ J♦ K♦",
      "9♦ 3♥ 2♣ 2♠ Q♠ J♥ 7♥",
    ],
    stock:
      "8♦ 7♦ 3♣ 6♦ 9♠ 2♦ 5♦ K♣ T♠ 8♥ K♥ 8♣ 5♥ 8♠ 7♣ A♦ 4♣ 7♠ 5♠ T♥ 3♦ 2♥ 6♥ T♣",
  },
  {
    seed: 42,
    tableau: [
      "4♦",
      "J♣ A♣",
      "K♥ 6♠ T♣",
      "Q♣ 9♠ 8♥ 9♥",
      "4♣ T♦ 2♥ 5♠ 3♦",
      "7♠ J♦ 3♣ 7♣ A♠ 2♣",
      "7♥ 6♣ Q♥ 8♦ Q♦ 2♠ 3♠",
    ],
    stock:
      "K♣ T♥ 8♣ 3♥ J♠ 7♦ 4♥ 6♦ K♦ K♠ 9♣ A♦ A♥ 9♦ 5♥ 2♦ 5♦ J♥ Q♠ 4♠ 8♠ 5♣ 6♥ T♠",
  },
  {
    seed: 1337,
    tableau: [
      "4♦",
      "4♣ 5♠",
      "3♠ 5♥ 8♦",
      "J♥ 4♠ 9♣ A♣",
      "2♦ 3♦ 2♠ K♥ J♦",
      "8♥ 6♣ Q♠ A♠ 9♥ 8♣",
      "5♦ 3♥ 6♥ 3♣ 2♥ T♠ T♦",
    ],
    stock:
      "9♦ Q♦ 9♠ A♥ 5♣ T♣ K♣ J♠ 7♥ K♦ Q♣ 8♠ 6♠ 7♦ 4♥ T♥ Q♥ J♣ 7♠ K♠ A♦ 2♣ 6♦ 7♣",
  },
  {
    seed: 4811209,
    tableau: [
      "8♣",
      "Q♦ 8♦",
      "A♦ 5♠ J♣",
      "J♥ 2♣ K♥ Q♥",
      "4♣ 9♥ 7♥ 6♦ K♦",
      "4♦ 5♦ 6♣ 9♠ A♠ K♠",
      "7♣ A♣ Q♣ 2♠ 3♣ T♣ 6♥",
    ],
    stock:
      "T♦ T♠ J♠ Q♠ 9♦ 5♥ 6♠ 8♠ 5♣ K♣ T♥ A♥ 2♦ 3♠ 4♠ 3♥ 7♦ 2♥ 4♥ J♦ 9♣ 7♠ 8♥ 3♦",
  },
  {
    seed: 2147483648,
    tableau: [
      "J♣",
      "6♥ 9♥",
      "5♣ Q♦ 7♦",
      "K♠ A♦ 7♣ 9♦",
      "A♠ T♠ 4♥ K♦ Q♠",
      "2♦ Q♣ 6♦ T♣ 6♣ 3♠",
      "J♥ 4♣ 9♠ A♥ 9♣ J♠ 8♥",
    ],
    stock:
      "2♠ 7♠ 3♣ 5♠ 3♥ 3♦ A♣ 8♣ 5♦ T♥ 7♥ 2♥ 5♥ 2♣ J♦ 4♦ T♦ 8♠ K♣ Q♥ K♥ 6♠ 4♠ 8♦",
  },
  {
    seed: 4294967295,
    tableau: [
      "5♦",
      "A♠ 6♣",
      "2♦ 3♥ J♣",
      "K♣ J♠ 2♣ 8♣",
      "Q♥ 8♥ K♠ 2♠ 9♦",
      "Q♠ 2♥ J♥ A♣ T♥ 3♣",
      "J♦ 5♥ 9♣ 3♦ T♦ 5♣ 7♠",
    ],
    stock:
      "8♦ 7♣ A♥ K♥ 6♦ 4♥ 9♥ A♦ 4♣ Q♣ 7♥ 4♦ Q♦ 6♠ K♦ 5♠ 3♠ T♣ 4♠ 6♥ 8♠ T♠ 9♠ 7♦",
  },
];

describe("the frozen deal", () => {
  for (const golden of GOLDEN_DEALS) {
    it(`deal ${golden.seed} is exactly what it has always been`, () => {
      const state = deal(golden.seed, 1);
      assert.deepEqual(
        state.tableau.map((column) => showCards(column.cards)),
        golden.tableau,
      );
      assert.equal(showCards(state.stock), golden.stock);
    });
  }
});

describe("deal", () => {
  it("puts twenty-eight cards in the tableau and twenty-four in the stock", () => {
    const state = deal(1, 1);
    const tableau = state.tableau.reduce((n, c) => n + c.cards.length, 0);
    assert.equal(tableau, TABLEAU_CARDS);
    assert.equal(state.stock.length, STOCK_CARDS);
    assert.equal(tableau + state.stock.length, DECK_SIZE);
  });

  it("deals column n with n + 1 cards, one of them face up", () => {
    const state = deal(99, 1);
    state.tableau.forEach((column, n) => {
      assert.equal(column.cards.length, n + 1, `column ${n} length`);
      assert.equal(column.down, n, `column ${n} face-down count`);
    });
    assert.equal(state.tableau.length, TABLEAU_COLUMNS);
  });

  it("starts with nothing drawn and nothing home", () => {
    const state = deal(7, 3);
    assert.deepEqual(state.waste, []);
    assert.deepEqual(state.foundations, [[], [], [], []]);
    assert.equal(state.moves, 0);
    assert.equal(state.seed, 7);
    assert.equal(state.drawCount, 3);
  });

  it("holds every card exactly once", () => {
    for (const seed of [0, 3, 500, 0xffffffff]) {
      assert.deepEqual(invariantViolations(deal(seed, 1)), [], `seed ${seed}`);
    }
  });

  it("is a pure function of the seed", () => {
    assert.deepEqual(deal(123, 1), deal(123, 1));
  });

  it("gives different seeds different deals", () => {
    const shown = (seed: number) =>
      deal(seed, 1)
        .tableau.map((c) => c.cards.map(cardName).join(""))
        .join("/");
    assert.notEqual(shown(10), shown(11));
  });

  it("refuses a deal number that isn't a uint32", () => {
    for (const bad of [-1, 1.5, NaN, Infinity, 2 ** 32]) {
      assert.equal(isSeed(bad), false, `${bad} should not be a seed`);
      assert.throws(() => deal(bad, 1), RangeError, `${bad} should throw`);
    }
    assert.equal(isSeed(0), true);
    assert.equal(isSeed(0xffffffff), true);
  });
});
