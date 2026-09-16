import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type GameState,
  type Move,
  CLUBS,
  DIAMONDS,
  HEARTS,
  SPADES,
  applyMove,
  cardOf,
  deal,
  legalMoves,
} from "../../src/engine/index.ts";
import { type PileRef, PILE_ORDER } from "../../src/game/Layout.ts";
import {
  BOARD_HELP,
  SHORTCUTS,
  announceHint,
  announceMove,
  announceUndo,
  announceWin,
  pileLabel,
  spokenCard,
  spokenDuration,
  words,
} from "../../src/game/strings.ts";
import { makeState, playGreedily } from "../engine/helpers.ts";

/**
 * Everything the board says out loud.
 *
 * These are the sentences from docs/08-accessibility.md, asserted as
 * sentences. A live region is the one part of the interface that cannot be
 * looked at to see whether it is right, and "Q♣" read aloud as nothing at all
 * is a bug nobody sighted will ever notice.
 */

describe("spelling things out", () => {
  it("names a card the way a person would say it", () => {
    assert.equal(spokenCard(cardOf(CLUBS, 11)), "queen of clubs");
    assert.equal(spokenCard(cardOf(SPADES, 0)), "ace of spades");
    assert.equal(spokenCard(cardOf(DIAMONDS, 9)), "ten of diamonds");
    assert.equal(spokenCard(cardOf(HEARTS, 12)), "king of hearts");
  });

  it("writes numbers as words, as far as the game can count", () => {
    assert.equal(words(0), "zero");
    assert.equal(words(7), "seven");
    assert.equal(words(13), "thirteen");
    assert.equal(words(21), "twenty-one");
    assert.equal(words(52), "fifty-two");
    assert.equal(words(100), "one hundred");
    assert.equal(words(128), "one hundred and twenty-eight");
    assert.equal(words(1000), "one thousand");
    assert.equal(words(1024), "one thousand and twenty-four");
    // Past four figures it stops pretending, rather than growing a rule for a
    // game nobody has played.
    assert.equal(words(10000), "10000");
  });

  it("says a duration rather than reading a clock face", () => {
    assert.equal(spokenDuration(134_000), "two minutes fourteen seconds");
    assert.equal(spokenDuration(1000), "one second");
    assert.equal(spokenDuration(60_000), "one minute");
    assert.equal(spokenDuration(0), "zero seconds");
    assert.equal(
      spokenDuration(3_723_000),
      "one hour two minutes three seconds",
    );
  });
});

describe("what a pile calls itself", () => {
  it("describes each kind exactly as docs/08 writes it", () => {
    const state = makeState({
      stock: "2♣ 3♣ 4♣ 5♣ 6♣ 7♣ 8♣ 9♣ T♣ J♣ Q♣",
      waste: "K♣",
      foundations: "7♥",
      tableau: ["A♠ 2♠ 3♠ | 4♦ 3♠ 2♦ J♥"],
    });

    assert.equal(
      pileLabel(state, { pile: "stock" }),
      "Stock. Eleven cards remaining.",
    );
    assert.equal(
      pileLabel(state, { pile: "waste" }),
      "Waste. Top card: King of clubs.",
    );
    assert.equal(
      pileLabel(state, { pile: "foundation", suit: SPADES }),
      "Foundation, spades. Empty.",
    );
    assert.equal(
      pileLabel(state, { pile: "foundation", suit: HEARTS }),
      "Foundation, hearts. Up to the seven.",
    );
    assert.equal(
      pileLabel(state, { pile: "tableau", column: 0 }),
      "Tableau column one. Seven cards, three face down. Top card: Jack of hearts.",
    );
    assert.equal(
      pileLabel(state, { pile: "tableau", column: 3 }),
      "Tableau column four. Empty.",
    );
  });

  it("never says a suit glyph or a rank letter, on any board a game reaches", () => {
    // Glyphs read unpredictably and "Q" is read as an ordinal by some voices.
    // The only way to be sure is to look at every label of a whole game.
    let state = deal(3, 1);
    for (const move of playGreedily(state).moves) {
      for (const ref of PILE_ORDER) {
        const label = pileLabel(state, ref as PileRef);
        assert.doesNotMatch(label, /[♣♦♥♠]/, label);
        assert.match(label, /^[A-Za-z ,.:-]+$/, label);
      }
      state = applyMove(state, move);
    }
  });
});

describe("what a move sounds like", () => {
  function say(state: GameState, move: Move): string {
    return announceMove(state, applyMove(state, move), move);
  }

  it("names the card and where it went", () => {
    const state = makeState({
      tableau: ["J♥", "Q♠"],
    });
    assert.equal(
      say(state, { kind: "tableauToTableau", from: 0, to: 1, count: 1 }),
      "Jack of hearts to column two.",
    );
  });

  it("adds the card a move turned up, which is the half you cannot see coming", () => {
    const state = makeState({ tableau: ["5♠ | J♥", "Q♠"] });
    assert.equal(
      say(state, { kind: "tableauToTableau", from: 0, to: 1, count: 1 }),
      "Jack of hearts to column two. Five of spades turned up.",
    );
  });

  it("says a run as its bottom card and how many more", () => {
    const state = makeState({ tableau: ["9♠ 8♦ 7♣", "T♥"] });
    assert.equal(
      say(state, { kind: "tableauToTableau", from: 0, to: 1, count: 3 }),
      "Nine of spades and two more to column two.",
    );
  });

  it("does not say which foundation, because nobody chooses", () => {
    const state = makeState({ waste: "A♥" });
    assert.equal(
      say(state, { kind: "wasteToFoundation" }),
      "Ace of hearts to foundation.",
    );
  });

  it("counts a draw-3 rather than listing it", () => {
    const one = makeState({ stock: "Q♣", drawCount: 1 });
    assert.equal(say(one, { kind: "draw" }), "Drew queen of clubs.");

    const three = makeState({ stock: "2♦ 5♠ Q♣", drawCount: 3 });
    assert.equal(
      say(three, { kind: "draw" }),
      "Drew three. Top card: Queen of clubs.",
    );
  });

  it("has a sentence for the waste going back", () => {
    const state = makeState({ waste: "2♦ 5♠" });
    assert.equal(say(state, { kind: "recycle" }), "Waste returned to stock.");
  });

  it("names the card an undo brought back, and where to", () => {
    const state = makeState({ tableau: ["5♠ | J♥", "Q♠"] });
    const move: Move = { kind: "tableauToTableau", from: 0, to: 1, count: 1 };
    // Said of the board as it is once the move has been taken back.
    assert.equal(
      announceUndo(state, move),
      "Undid. Jack of hearts back to column one.",
    );
    assert.equal(announceUndo(state, { kind: "draw" }), "Undid the draw.");
  });

  it("spells a hint out as well as pulsing it", () => {
    const state = makeState({ tableau: ["J♥", "Q♠"] });
    assert.equal(
      announceHint(state, {
        kind: "tableauToTableau",
        from: 0,
        to: 1,
        count: 1,
      }),
      "Hint: jack of hearts from column one to column two.",
    );
  });

  it("says the win the way docs/08 writes it", () => {
    assert.equal(
      announceWin(134_000, 128),
      "You won. Two minutes fourteen seconds, one hundred and twenty-eight moves.",
    );
    assert.equal(announceWin(1000, 1), "You won. One second, one move.");
  });

  /**
   * The one that matters: every move a real game is made of gets a sentence,
   * and none of them is empty, a glyph, or `undefined` leaking through a
   * template. A missed case in a live region is silence, which is
   * indistinguishable from the game having stopped responding.
   */
  it("has something to say about every legal move of a whole game", () => {
    let state = deal(3, 1);
    for (const move of playGreedily(state).moves) {
      for (const candidate of legalMoves(state)) {
        const spoken = announceMove(
          state,
          applyMove(state, candidate),
          candidate,
        );
        assert.match(spoken, /^[A-Z].*\.$/, `${candidate.kind}: ${spoken}`);
        assert.doesNotMatch(spoken, /undefined|NaN|[♣♦♥♠]/, spoken);
        assert.ok(announceHint(state, candidate).startsWith("Hint: "));
      }
      state = applyMove(state, move);
    }
  });
});

describe("the written word", () => {
  it("describes the key model in the paragraph the board points at", () => {
    // Not a restatement of the overlay — one breath, not twelve rows — but it
    // has to name the keys somebody with no screen to look at needs first.
    for (const key of ["arrow", "Space", "escape", "S ", "A ", "H ", "Z "]) {
      assert.ok(BOARD_HELP.includes(key), `board help never mentions ${key}`);
    }
  });

  it("advertises every shortcut exactly once", () => {
    const seen = new Set(SHORTCUTS.map(({ what }) => what));
    assert.equal(seen.size, SHORTCUTS.length);
    for (const { keys } of SHORTCUTS) assert.ok(keys.length > 0);
  });
});
