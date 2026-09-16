import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type GameState, type Move } from "../../src/engine/index.ts";
import { type Hit, type PileRef } from "../../src/game/Layout.ts";
import { autoMove } from "../../src/game/automove.ts";
import { makeState, parseCard } from "../engine/helpers.ts";

/**
 * Tap-to-auto-move is the most important interaction in the game and the one
 * docs/07-architecture.md flags as most likely to need tuning. These tests pin
 * what it does *today*, so a tuning pass is a deliberate act rather than a
 * silent one.
 */

function tap(state: GameState, ref: PileRef, index: number): Move | null {
  const pile =
    ref.pile === "tableau"
      ? (state.tableau[ref.column]?.cards ?? [])
      : ref.pile === "waste"
        ? state.waste
        : ref.pile === "stock"
          ? state.stock
          : (state.foundations[ref.suit] ?? []);
  const hit: Hit = { ref, index, card: pile[index] ?? null };
  return autoMove(state, hit);
}

function tapColumn(state: GameState, column: number, index: number) {
  return tap(state, { pile: "tableau", column }, index);
}

function tapWaste(state: GameState, index?: number) {
  return tap(state, { pile: "waste" }, index ?? state.waste.length - 1);
}

describe("tapping the stock", () => {
  it("turns a card", () => {
    const state = makeState({ stock: "5♠ 6♥" });
    assert.deepEqual(tap(state, { pile: "stock" }, 0), { kind: "draw" });
  });

  it("puts the waste back once the stock is spent", () => {
    const state = makeState({ waste: "5♠" });
    assert.deepEqual(tap(state, { pile: "stock" }, -1), { kind: "recycle" });
  });
});

describe("tapping a card that can go home", () => {
  it("sends an Ace up from the tableau", () => {
    const state = makeState({ tableau: ["K♠ | A♦"] });
    assert.deepEqual(tapColumn(state, 0, 1), {
      kind: "tableauToFoundation",
      from: 0,
    });
  });

  it("sends an Ace up from the waste", () => {
    const state = makeState({ waste: "9♣ A♦" });
    assert.deepEqual(tapWaste(state), { kind: "wasteToFoundation" });
  });

  it("sends a card up once nothing in the tableau could still want it", () => {
    // Both black sixes are already home, so the seven of hearts is free to go.
    const state = makeState({
      foundations: "6♥ 6♣ 6♠",
      waste: "7♥",
      tableau: ["8♠"],
    });
    assert.deepEqual(tapWaste(state), { kind: "wasteToFoundation" });
  });

  /**
   * The rule this one used to assert the opposite of: a legal foundation move
   * was held back while a black six was still looking for a home, on the
   * grounds that sending the 7♥ up is a move players almost never want.
   *
   * It goes home. The guard made the most-used gesture in the game
   * unpredictable — two cards that look equally home-able doing different
   * things, for a reason nothing on screen explains — and it was overriding
   * the player on 2.7% of all taps. See the note on rule 1 in automove.ts, and
   * `scripts/audit-automove.ts` for what the change costs.
   */
  it("sends it up even while a black six is still looking for a home", () => {
    const state = makeState({
      foundations: "6♥",
      waste: "7♥",
      tableau: ["8♠"],
    });
    assert.deepEqual(tapWaste(state), { kind: "wasteToFoundation" });
  });

  it("sends it up when there is nowhere else for it to go either", () => {
    const state = makeState({ foundations: "6♥", waste: "7♥" });
    assert.deepEqual(tapWaste(state), { kind: "wasteToFoundation" });
  });
});

describe("tapping a card that moves across", () => {
  it("takes the whole run below the card you tapped", () => {
    const state = makeState({ tableau: ["A♣ | 5♠ 4♥", "6♥"] });
    assert.deepEqual(tapColumn(state, 0, 1), {
      kind: "tableauToTableau",
      from: 0,
      to: 1,
      count: 2,
    });
  });

  it("breaks ties leftwards", () => {
    const state = makeState({ waste: "5♠", tableau: ["6♥", "6♦"] });
    assert.deepEqual(tapWaste(state), { kind: "wasteToTableau", to: 0 });
  });

  it("fills an empty column with a King", () => {
    const state = makeState({ waste: "K♠", tableau: ["", "3♦"] });
    assert.deepEqual(tapWaste(state), { kind: "wasteToTableau", to: 0 });
  });

  it("will not shuffle a lone King from one hole to another", () => {
    const state = makeState({ tableau: ["K♠", ""] });
    assert.equal(tapColumn(state, 0, 0), null);
  });

  it("will move a King that is covering a face-down card", () => {
    // The King is index 1 — the face-down ace beneath it is index 0.
    const state = makeState({ tableau: ["A♥ | K♠", ""] });
    assert.deepEqual(tapColumn(state, 0, 1), {
      kind: "tableauToTableau",
      from: 0,
      to: 1,
      count: 1,
    });
  });
});

describe("taps that mean nothing", () => {
  it("ignores a face-down card", () => {
    const state = makeState({ tableau: ["A♦ | K♠"] });
    assert.equal(tapColumn(state, 0, 0), null);
  });

  it("ignores a buried waste card", () => {
    const state = makeState({ waste: "A♦ 9♣", tableau: ["K♠"] });
    assert.equal(tapWaste(state, 0), null);
  });

  it("ignores a foundation with nowhere to send its card", () => {
    // Same colour, so the Ace has no column to come down onto, and there is no
    // hole for it either — a hole is a King's.
    const state = makeState({ foundations: "A♦", tableau: ["2♥"] });
    assert.equal(
      tap(state, { pile: "foundation", suit: 1 }, 0),
      null,
      `${parseCard("A♦")} should stay put`,
    );
  });

  it("ignores a foundation tapped anywhere but on its top card", () => {
    const state = makeState({ foundations: "A♦ 2♦", tableau: ["3♠"] });
    assert.equal(tap(state, { pile: "foundation", suit: 1 }, 0), null);
    assert.equal(tap(state, { pile: "foundation", suit: 1 }, -1), null);
  });

  it("returns nothing for a card with nowhere to go", () => {
    const state = makeState({ tableau: ["A♣ | 9♠", "9♥"] });
    assert.equal(tapColumn(state, 0, 1), null);
  });
});

/**
 * A card can always be dragged back off a foundation when a run needs it, and
 * on a phone dragging is the fiddly half of the interface. A tap is the same
 * "do the obvious thing" gesture pointed the other way — and since the card is
 * already home, the only obvious thing left is a column.
 */
describe("tapping a card that is already home", () => {
  it("brings it down onto a card it fits", () => {
    const state = makeState({ foundations: "A♦ 2♦", tableau: ["K♠ | 3♠"] });
    assert.deepEqual(tap(state, { pile: "foundation", suit: 1 }, 1), {
      kind: "foundationToTableau",
      suit: 1,
      to: 0,
    });
  });

  it("brings a King down into an empty column", () => {
    const state = makeState({
      foundations: "A♠ 2♠ 3♠ 4♠ 5♠ 6♠ 7♠ 8♠ 9♠ T♠ J♠ Q♠ K♠",
      tableau: [""],
    });
    assert.deepEqual(tap(state, { pile: "foundation", suit: 3 }, 12), {
      kind: "foundationToTableau",
      suit: 3,
      to: 0,
    });
  });

  it("leaves a non-King alone rather than filling a hole with it", () => {
    // Rule 4 is a hole for a King, and it is the same rule from up here.
    const state = makeState({ foundations: "A♦ 2♦", tableau: [""] });
    assert.equal(tap(state, { pile: "foundation", suit: 1 }, 1), null);
  });
});
