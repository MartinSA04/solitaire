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

  it("plays it across instead while a black six is still looking for a home", () => {
    // The move players almost never want, from docs/05-interaction-and-motion.md.
    const state = makeState({
      foundations: "6♥",
      waste: "7♥",
      tableau: ["8♠"],
    });
    assert.deepEqual(tapWaste(state), { kind: "wasteToTableau", to: 0 });
  });

  it("sends it up anyway when there is nowhere else for it to go", () => {
    // A tap on the only playable card doing nothing reads as broken.
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

  it("ignores a foundation — a tap never says bring that back", () => {
    const state = makeState({ foundations: "A♦", tableau: ["2♠"] });
    assert.equal(
      tap(state, { pile: "foundation", suit: 1 }, 0),
      null,
      `${parseCard("A♦")} should stay put`,
    );
  });

  it("returns nothing for a card with nowhere to go", () => {
    const state = makeState({ tableau: ["A♣ | 9♠", "9♥"] });
    assert.equal(tapColumn(state, 0, 1), null);
  });
});
