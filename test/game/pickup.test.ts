import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type GameState } from "../../src/engine/index.ts";
import { type Hit, type PileRef } from "../../src/game/Layout.ts";
import { type Grab, dropMove, grab } from "../../src/game/pickup.ts";
import { makeState, showCards } from "../engine/helpers.ts";

function at(state: GameState, ref: PileRef, index: number): Hit {
  const pile =
    ref.pile === "tableau"
      ? (state.tableau[ref.column]?.cards ?? [])
      : ref.pile === "waste"
        ? state.waste
        : ref.pile === "stock"
          ? state.stock
          : (state.foundations[ref.suit] ?? []);
  return { ref, index, card: pile[index] ?? null };
}

describe("picking a stack up", () => {
  it("takes the card and everything above it", () => {
    const state = makeState({ tableau: ["A♣ | 6♥ 5♠ 4♥"] });
    const held = grab(state, at(state, { pile: "tableau", column: 0 }, 1));
    assert.equal(showCards((held as Grab).cards), "6♥ 5♠ 4♥");
  });

  it("will not take a face-down card", () => {
    const state = makeState({ tableau: ["A♣ 2♣ | 4♥"] });
    assert.equal(
      grab(state, at(state, { pile: "tableau", column: 0 }, 1)),
      null,
    );
  });

  it("takes only the top of the waste and of a foundation", () => {
    const state = makeState({ waste: "A♦ 9♣", foundations: "2♦" });
    assert.equal(grab(state, at(state, { pile: "waste" }, 0)), null);
    assert.equal(
      showCards((grab(state, at(state, { pile: "waste" }, 1)) as Grab).cards),
      "9♣",
    );
    assert.equal(
      showCards(
        (grab(state, at(state, { pile: "foundation", suit: 1 }, 1)) as Grab)
          .cards,
      ),
      "2♦",
    );
  });

  it("never takes anything from the stock — it has one gesture, and it is a tap", () => {
    const state = makeState({ stock: "A♦ 9♣" });
    assert.equal(grab(state, at(state, { pile: "stock" }, 1)), null);
  });

  it("takes nothing from an empty slot", () => {
    const state = makeState({});
    assert.equal(
      grab(state, at(state, { pile: "tableau", column: 3 }, -1)),
      null,
    );
  });
});

describe("putting a stack down", () => {
  const held = (state: GameState, ref: PileRef, index: number): Grab =>
    grab(state, at(state, ref, index)) as Grab;

  it("plays the waste onto a column", () => {
    const state = makeState({ waste: "5♠", tableau: ["6♥"] });
    assert.deepEqual(
      dropMove(state, held(state, { pile: "waste" }, 0), {
        pile: "tableau",
        column: 0,
      }),
      { kind: "wasteToTableau", to: 0 },
    );
  });

  it("plays a run onto a column", () => {
    const state = makeState({ tableau: ["A♣ | 5♠ 4♥", "6♥"] });
    assert.deepEqual(
      dropMove(state, held(state, { pile: "tableau", column: 0 }, 1), {
        pile: "tableau",
        column: 1,
      }),
      { kind: "tableauToTableau", from: 0, to: 1, count: 2 },
    );
  });

  it("brings a card back off a foundation", () => {
    const state = makeState({ foundations: "2♦", tableau: ["3♠"] });
    assert.deepEqual(
      dropMove(state, held(state, { pile: "foundation", suit: 1 }, 1), {
        pile: "tableau",
        column: 0,
      }),
      { kind: "foundationToTableau", suit: 1, to: 0 },
    );
  });

  it("refuses a run onto a foundation — one card at a time", () => {
    const state = makeState({ foundations: "3♥", tableau: ["A♣ | 5♠ 4♥"] });
    assert.equal(
      dropMove(state, held(state, { pile: "tableau", column: 0 }, 1), {
        pile: "foundation",
        suit: 2,
      }),
      null,
    );
  });

  it("refuses a card onto the wrong foundation", () => {
    const state = makeState({ foundations: "A♦", waste: "2♥" });
    assert.equal(
      dropMove(state, held(state, { pile: "waste" }, 0), {
        pile: "foundation",
        suit: 1,
      }),
      null,
    );
  });

  it("refuses an illegal landing", () => {
    const state = makeState({ waste: "5♠", tableau: ["6♠"] });
    assert.equal(
      dropMove(state, held(state, { pile: "waste" }, 0), {
        pile: "tableau",
        column: 0,
      }),
      null,
    );
  });

  it("refuses the stock and the waste as targets", () => {
    const state = makeState({ tableau: ["K♠"], stock: "2♦" });
    const stack = held(state, { pile: "tableau", column: 0 }, 0);
    assert.equal(dropMove(state, stack, { pile: "stock" }), null);
    assert.equal(dropMove(state, stack, { pile: "waste" }), null);
  });
});
