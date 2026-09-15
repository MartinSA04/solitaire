import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Suit, SUIT_COUNT } from "../../src/engine/card.ts";
import { deal } from "../../src/engine/deal.ts";
import {
  emptiesColumn,
  isHoleShuffle,
  legalMoves,
  turnsOverCard,
} from "../../src/engine/enumerate.ts";
import {
  type Move,
  applyMove,
  encodeMove,
  isLegal,
} from "../../src/engine/moves.ts";
import { RANK_COUNT } from "../../src/engine/card.ts";
import { mulberry32 } from "../../src/engine/rng.ts";
import { TABLEAU_COLUMNS } from "../../src/engine/state.ts";
import { makeState } from "./helpers.ts";

/** Every move anyone could name, legal or not. The reference `legalMoves` is checked against. */
function everyConceivableMove(): Move[] {
  const moves: Move[] = [
    { kind: "draw" },
    { kind: "recycle" },
    { kind: "wasteToFoundation" },
  ];
  for (let to = 0; to < TABLEAU_COLUMNS; to++) {
    moves.push({ kind: "wasteToTableau", to });
  }
  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    moves.push({ kind: "tableauToFoundation", from });
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      for (let count = 1; count <= RANK_COUNT; count++) {
        moves.push({ kind: "tableauToTableau", from, to, count });
      }
    }
  }
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      moves.push({ kind: "foundationToTableau", suit: suit as Suit, to });
    }
  }
  return moves;
}

const CANDIDATES = everyConceivableMove();

describe("legalMoves", () => {
  it("enumerates every legal move and no illegal one", () => {
    const pick = mulberry32(0x50117a1e);
    for (let game = 0; game < 40; game++) {
      let state = deal(pick(), pick() % 2 === 0 ? 1 : 3);
      for (let step = 0; step < 120; step++) {
        const enumerated = legalMoves(state);
        for (const move of enumerated) {
          assert.ok(
            isLegal(state, move),
            `enumerated an illegal ${encodeMove(move)}`,
          );
        }
        const brute = CANDIDATES.filter((move) => isLegal(state, move));
        assert.deepEqual(
          new Set(enumerated.map(encodeMove)),
          new Set(brute.map(encodeMove)),
          `deal ${state.seed} after ${state.moves} moves`,
        );
        assert.equal(
          enumerated.length,
          new Set(enumerated.map(encodeMove)).size,
          "enumerated the same move twice",
        );
        if (enumerated.length === 0) break;
        state = applyMove(
          state,
          enumerated[pick() % enumerated.length] as Move,
        );
      }
    }
  });

  it("is deterministic, so a search over it is reproducible", () => {
    const state = deal(4811209, 3);
    assert.deepEqual(legalMoves(state), legalMoves(state));
  });

  it("offers the same run to each column it fits", () => {
    const state = makeState({ tableau: ["9♦", "9♥", "8♠ 7♥"] });
    const runs = legalMoves(state).filter((m) => m.kind === "tableauToTableau");
    assert.deepEqual(runs.map(encodeMove).sort(), ["t2t0x2", "t2t1x2"]);
  });

  it("includes moves no player would want, because the solver needs them", () => {
    const state = makeState({ foundations: "A♠", tableau: ["2♥"] });
    assert.ok(
      legalMoves(state).some((m) => m.kind === "foundationToTableau"),
      "an Ace should be offered back to the tableau",
    );
  });

  it("offers a recycle only once the stock is out", () => {
    const withStock = makeState({ stock: "5♠", waste: "A♠" });
    assert.deepEqual(
      legalMoves(withStock).filter((m) => m.kind !== "wasteToFoundation"),
      [{ kind: "draw" }],
    );
    const spent = makeState({ waste: "5♠" });
    assert.deepEqual(legalMoves(spent), [{ kind: "recycle" }]);
  });
});

describe("classifying a move", () => {
  it("spots the ones that turn a card over", () => {
    const state = makeState({ tableau: ["9♦", "A♣ | 8♠ 7♥", "2♣ | A♠"] });
    const run: Move = { kind: "tableauToTableau", from: 1, to: 0, count: 2 };
    assert.equal(turnsOverCard(state, run), true);
    assert.equal(
      turnsOverCard(state, {
        kind: "tableauToTableau",
        from: 1,
        to: 0,
        count: 1,
      }),
      false,
      "7♥ alone leaves 8♠ face up",
    );
    assert.equal(
      turnsOverCard(state, { kind: "tableauToFoundation", from: 2 }),
      true,
    );
    assert.equal(turnsOverCard(state, { kind: "draw" }), false);
  });

  it("spots the ones that empty a column", () => {
    const state = makeState({ tableau: ["9♦", "8♠", "A♠", "A♣ | 8♥"] });
    assert.equal(
      emptiesColumn(state, {
        kind: "tableauToTableau",
        from: 1,
        to: 0,
        count: 1,
      }),
      true,
    );
    assert.equal(
      emptiesColumn(state, { kind: "tableauToFoundation", from: 2 }),
      true,
    );
    assert.equal(
      emptiesColumn(state, {
        kind: "tableauToTableau",
        from: 3,
        to: 0,
        count: 1,
      }),
      false,
      "a face-down card is left behind",
    );
  });

  it("spots a hole being moved from one column to another", () => {
    const state = makeState({ tableau: ["", "K♠ Q♥", "9♦", "8♠"] });
    assert.equal(
      isHoleShuffle(state, {
        kind: "tableauToTableau",
        from: 1,
        to: 0,
        count: 2,
      }),
      true,
    );
    assert.equal(
      isHoleShuffle(state, {
        kind: "tableauToTableau",
        from: 3,
        to: 2,
        count: 1,
      }),
      false,
    );
  });
});
