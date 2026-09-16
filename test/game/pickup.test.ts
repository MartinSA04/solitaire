import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type GameState } from "../../src/engine/index.ts";
import { type Hit, type PileRef, PILE_ORDER } from "../../src/game/Layout.ts";
import {
  type Grab,
  dropMove,
  grab,
  legalTargets,
} from "../../src/game/pickup.ts";
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

/** Whatever `ref`/`index` names, in hand — every drop test starts by picking something up. */
const held = (state: GameState, ref: PileRef, index: number): Grab =>
  grab(state, at(state, ref, index)) as Grab;

describe("putting a stack down", () => {
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

describe("where a pickup could go", () => {
  /** The thirteen flags back as pile names, which is what the assertions read as. */
  function targetNames(state: GameState, stack: Grab | null): string[] {
    return legalTargets(state, stack)
      .map((ok, index) => (ok ? pileName(PILE_ORDER[index] as PileRef) : null))
      .filter((name): name is string => name !== null);
  }

  function pileName(ref: PileRef): string {
    switch (ref.pile) {
      case "foundation":
        return `foundation ${ref.suit}`;
      case "tableau":
        return `column ${ref.column}`;
      default:
        return ref.pile;
    }
  }

  it("is nothing at all when nothing is in hand", () => {
    const state = makeState({ tableau: ["K♠"], waste: "A♦" });
    assert.deepEqual(targetNames(state, null), []);
    assert.equal(legalTargets(state, null).length, PILE_ORDER.length);
  });

  it("is one foundation for an ace, and nowhere else", () => {
    const state = makeState({ waste: "A♦", tableau: ["K♠", "", "5♥"] });
    assert.deepEqual(targetNames(state, held(state, { pile: "waste" }, 0)), [
      "foundation 1",
    ]);
  });

  it("is every column that would take the card, and no others", () => {
    // A black six goes on either red seven — not on the eight, and not into
    // the empty column, which only a King may have. docs/02.
    const state = makeState({
      waste: "6♠",
      tableau: ["7♥", "", "7♦", "8♠"],
    });
    assert.deepEqual(targetNames(state, held(state, { pile: "waste" }, 0)), [
      "column 0",
      "column 2",
    ]);
  });

  it("is only the holes for a king, and never the stock or the waste", () => {
    const state = makeState({ waste: "K♠", tableau: ["7♥", ""] });
    const stack = held(state, { pile: "waste" }, 0);
    assert.deepEqual(targetNames(state, stack), [
      "column 1",
      "column 2",
      "column 3",
      "column 4",
      "column 5",
      "column 6",
    ]);
  });

  it("is nowhere for a run a foundation could otherwise have taken", () => {
    // A foundation takes one card at a time; a run of two has only columns.
    const state = makeState({ tableau: ["9♠ 8♥", "T♥", "T♦"] });
    const run = held(state, { pile: "tableau", column: 0 }, 0);
    assert.deepEqual(targetNames(state, run), ["column 1", "column 2"]);
  });
});
