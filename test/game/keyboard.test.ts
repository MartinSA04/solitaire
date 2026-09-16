import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type Game,
  type Move,
  type Suit,
  TABLEAU_COLUMNS,
  deal,
  isWon,
  newGame,
} from "../../src/engine/index.ts";
import { FOUNDATION_ORDER, PILE_ORDER } from "../../src/game/Layout.ts";
import {
  type Action,
  type Focus,
  type Press,
  FIRST_FOCUS,
  clampFocus,
  focusedCards,
  interpret,
  pileAt,
} from "../../src/game/keyboard.ts";
import { type Grab } from "../../src/game/pickup.ts";
import { SHORTCUTS } from "../../src/game/strings.ts";
import { playGreedily, showCards } from "../engine/helpers.ts";

/**
 * Milestone 6's bar, at the level the bar is actually about: **a complete game
 * can be won using only a keyboard.**
 *
 * `e2e/keyboard.pw.ts` proves the wiring in a real browser. This proves the
 * model: that every move a winning line is made of can be expressed as key
 * presses, that the presses mean what docs/08-accessibility.md says they mean,
 * and that nothing in between needs a pointer.
 */

/** Where each kind of pile starts. The same three numbers Game.svelte's markup uses. */
const STOCK = 0;
const WASTE = 1;
const FOUNDATION = 2;
const TABLEAU = FOUNDATION + FOUNDATION_ORDER.length;

/**
 * A player with a keyboard and nothing else. It is the reducer half of
 * `Game.svelte`'s `perform` — the half that is about focus and hands rather
 * than about speech and pixels — and it plays through the same `interpret`
 * the island does.
 */
class Player {
  readonly game: Game;
  focus: Focus = FIRST_FOCUS;
  held: Grab | null = null;

  constructor(seed: number, drawCount: 1 | 3 = 1) {
    this.game = newGame(seed, drawCount);
  }

  press(key: string, modifiers: Omit<Press, "key"> = {}): Action | null {
    const action = interpret(
      { key, ...modifiers },
      this.game.state,
      this.focus,
      this.held,
    );
    if (action === null) return null;

    switch (action.kind) {
      case "focus":
      case "select":
        this.focus = action.focus;
        break;
      case "pick":
        this.held = action.held;
        break;
      case "release":
        this.held = null;
        break;
      case "play":
        assert.ok(this.game.play(action.move), "the engine refused the move");
        this.held = null;
        this.focus = clampFocus(this.game.state, this.focus);
        break;
      case "refuse":
      case "command":
        break;
    }
    return action;
  }

  /** Walk the focus there with arrow keys, the short way round. */
  goto(at: number): void {
    const count = PILE_ORDER.length;
    for (let guard = 0; this.focus.at !== at; guard++) {
      assert.ok(guard < count, "the focus will not move");
      const forward = (at - this.focus.at + count) % count;
      this.press(forward * 2 <= count ? "ArrowRight" : "ArrowLeft");
    }
  }

  /** Take exactly `cards` cards off the focused column. */
  reach(cards: number): void {
    while (this.focus.reach > cards) this.press("ArrowDown");
    while (this.focus.reach < cards) {
      const before = this.focus.reach;
      this.press("ArrowUp");
      assert.notEqual(this.focus.reach, before, "the column will not open");
    }
  }

  selected(): string {
    return showCards(focusedCards(this.game.state, this.focus));
  }
}

/**
 * A real position part-way through a real game, played far enough that some
 * column holds a run of `faceUp` cards. Half of the keyboard model is only
 * meaningful over a run, and a hand-written board would not prove it is
 * reachable.
 */
function partway(
  seed: number,
  faceUp: number,
): { player: Player; column: number } {
  const player = new Player(seed);
  for (const move of playGreedily(player.game.state).moves) {
    const column = player.game.state.tableau.findIndex(
      (c) => c.cards.length - c.down >= faceUp,
    );
    if (column >= 0) return { player, column };
    assert.ok(player.game.play(move));
  }
  throw new Error(`no run of ${faceUp} ever appears on deal ${seed}`);
}

function foundationAt(suit: Suit): number {
  return FOUNDATION + FOUNDATION_ORDER.indexOf(suit);
}

/**
 * One move, as the keys a player would press to make it. Every move in
 * Klondike is one of these six shapes, so this is the whole of "the game is
 * playable from a keyboard" — if a move exists that this cannot type, the
 * claim is false.
 */
function typeMove(player: Player, move: Move): void {
  switch (move.kind) {
    // The stock has one gesture and `S` is it, from wherever the focus is.
    case "draw":
    case "recycle":
      player.press("s");
      return;

    case "wasteToFoundation":
      player.goto(WASTE);
      player.press("a");
      return;

    case "tableauToFoundation":
      player.goto(TABLEAU + move.from);
      player.reach(1);
      player.press("a");
      return;

    case "wasteToTableau":
      player.goto(WASTE);
      player.press(" ");
      player.goto(TABLEAU + move.to);
      player.press(" ");
      return;

    case "foundationToTableau":
      player.goto(foundationAt(move.suit));
      player.press(" ");
      player.goto(TABLEAU + move.to);
      player.press(" ");
      return;

    case "tableauToTableau":
      player.goto(TABLEAU + move.from);
      player.reach(move.count);
      player.press(" ");
      player.goto(TABLEAU + move.to);
      player.press(" ");
      return;
  }
}

describe("the thirteen positions", () => {
  it("is the order docs/08 gives, which is reading order on the board", () => {
    assert.equal(
      PILE_ORDER.length,
      2 + FOUNDATION_ORDER.length + TABLEAU_COLUMNS,
    );
    assert.deepEqual(PILE_ORDER[STOCK], { pile: "stock" });
    assert.deepEqual(PILE_ORDER[WASTE], { pile: "waste" });
    FOUNDATION_ORDER.forEach((suit, index) => {
      assert.deepEqual(PILE_ORDER[FOUNDATION + index], {
        pile: "foundation",
        suit,
      });
    });
    for (let column = 0; column < TABLEAU_COLUMNS; column++) {
      assert.deepEqual(PILE_ORDER[TABLEAU + column], {
        pile: "tableau",
        column,
      });
    }
  });

  it("wraps rather than stopping at either end", () => {
    const player = new Player(24);
    player.press("ArrowLeft");
    assert.equal(player.focus.at, PILE_ORDER.length - 1);
    player.press("ArrowRight");
    assert.equal(player.focus.at, STOCK);
  });

  it("takes the top card of whatever it arrives at", () => {
    const { player, column } = partway(3, 3);
    player.goto(TABLEAU + column);
    player.reach(3);
    player.press("ArrowRight");
    player.goto(TABLEAU + column);
    assert.equal(player.focus.reach, 1);
  });
});

describe("the selection up a column", () => {
  it("opens and closes over the face-up run and no further", () => {
    // Column 7 of deal 24 is six face-down cards under one face-up.
    const player = new Player(24);
    player.goto(TABLEAU + 6);
    assert.equal(player.focus.reach, 1);
    // Nothing above it is face up, so there is nothing to open.
    assert.equal(player.press("ArrowUp"), null);
    assert.equal(player.press("ArrowDown"), null);
  });

  it("grows a card at a time once a run has been built", () => {
    const { player, column } = partway(3, 2);
    player.goto(TABLEAU + column);
    const one = player.selected();
    player.press("ArrowUp");
    assert.equal(player.focus.reach, 2);
    assert.ok(player.selected().endsWith(one), "the run grows upward");
    player.press("ArrowDown");
    assert.equal(player.selected(), one);
  });

  it("does nothing at all with a pickup in hand", () => {
    const player = new Player(24);
    player.goto(TABLEAU + 6);
    player.press(" ");
    assert.notEqual(player.held, null);
    assert.equal(player.press("ArrowUp"), null);
    assert.equal(player.press("ArrowDown"), null);
  });
});

describe("picking up and putting down", () => {
  it("puts a pickup back where it came from rather than refusing it", () => {
    const player = new Player(24);
    player.goto(TABLEAU + 6);
    assert.equal(player.press(" ")?.kind, "pick");
    assert.equal(player.press(" ")?.kind, "release");
    assert.equal(player.held, null);
  });

  it("escapes a pickup, and does nothing when there is none", () => {
    const player = new Player(24);
    assert.equal(player.press("Escape"), null);
    player.goto(TABLEAU + 6);
    player.press(" ");
    assert.equal(player.press("Escape")?.kind, "release");
    assert.equal(player.held, null);
  });

  it("refuses an empty pile, and a drop the rules do not allow", () => {
    const player = new Player(24);
    player.goto(WASTE);
    assert.deepEqual(player.press(" "), { kind: "refuse", card: null });

    player.press("s");
    player.goto(WASTE);
    assert.equal(player.press(" ")?.kind, "pick");
    // The stock is not a place to put a card down.
    player.goto(STOCK);
    assert.equal(player.press(" ")?.kind, "refuse");
    assert.notEqual(player.held, null, "a refused drop stays in hand");
  });

  it("keeps the hand still while the focus walks to the target", () => {
    const player = new Player(24);
    player.press("s");
    player.goto(WASTE);
    player.press(" ");
    const carrying = player.held;
    for (let step = 0; step < PILE_ORDER.length; step++) {
      player.press("ArrowRight");
      assert.equal(player.held, carrying);
    }
  });
});

describe("the single-key moves", () => {
  it("draws and recycles with S, from wherever the focus is", () => {
    const player = new Player(24);
    player.goto(TABLEAU + 3);
    const before = player.game.state.waste.length;
    player.press("s");
    assert.equal(player.game.state.waste.length, before + 1);
    assert.equal(player.focus.at, TABLEAU + 3, "S does not move the focus");
  });

  it("sends the focused card home with A", () => {
    // Column 7 of deal 24 is the ace of hearts.
    const player = new Player(24);
    player.goto(TABLEAU + 6);
    assert.equal(player.press("a")?.kind, "play");
    assert.equal(player.game.state.foundations[2]?.length, 1);
  });

  it("refuses A on a run, rather than quietly sending its top card", () => {
    const { player, column } = partway(3, 2);
    player.goto(TABLEAU + column);
    player.reach(2);
    assert.equal(player.press("a")?.kind, "refuse");
  });
});

describe("the keys that are not the board's", () => {
  it("takes Ctrl+Z as undo and leaves every other chord alone", () => {
    const state = deal(24, 1);
    assert.deepEqual(
      interpret({ key: "z", ctrlKey: true }, state, FIRST_FOCUS, null),
      {
        kind: "command",
        name: "undo",
      },
    );
    assert.deepEqual(
      interpret({ key: "z", metaKey: true }, state, FIRST_FOCUS, null),
      {
        kind: "command",
        name: "undo",
      },
    );
    // Ctrl+N is a new window and Ctrl+R is a reload. Neither is ours.
    assert.equal(
      interpret({ key: "n", ctrlKey: true }, state, FIRST_FOCUS, null),
      null,
    );
    assert.equal(
      interpret({ key: "r", ctrlKey: true }, state, FIRST_FOCUS, null),
      null,
    );
  });

  it("ignores anything with Alt on it, and anything it does not know", () => {
    const state = deal(24, 1);
    assert.equal(
      interpret({ key: "h", altKey: true }, state, FIRST_FOCUS, null),
      null,
    );
    assert.equal(interpret({ key: "Tab" }, state, FIRST_FOCUS, null), null);
    assert.equal(interpret({ key: "q" }, state, FIRST_FOCUS, null), null);
  });

  it("answers to the shift on a letter, and to a capital one", () => {
    const state = deal(24, 1);
    assert.deepEqual(interpret({ key: "H" }, state, FIRST_FOCUS, null), {
      kind: "command",
      name: "hint",
    });
  });

  /**
   * The overlay is a list of promises about keys. This is what makes it a list
   * of facts: every key `?` advertises does something, and the two lists are
   * one list.
   */
  it("honours every key the shortcut overlay advertises", () => {
    const keys: Record<string, string[]> = {
      "←": ["ArrowLeft"],
      "→": ["ArrowRight"],
      "↑": ["ArrowUp"],
      "↓": ["ArrowDown"],
      Space: [" "],
      Esc: ["Escape"],
    };
    // A position with something to pick up, something in hand and a run part
    // way open, so that no key is refused for want of anything to act on —
    // `↓` in particular only means something once `↑` has been pressed.
    const { player, column } = partway(3, 3);
    player.goto(TABLEAU + column);
    player.reach(2);
    const held = {
      from: pileAt(player.focus),
      cards: focusedCards(player.game.state, player.focus),
    };

    for (const { keys: advertised, what } of SHORTCUTS) {
      for (const label of advertised) {
        for (const key of keys[label] ?? [label.toLowerCase()]) {
          const action = interpret(
            { key },
            player.game.state,
            player.focus,
            key === "Escape" ? held : null,
          );
          assert.notEqual(action, null, `${label} (${what}) does nothing`);
        }
      }
    }
  });
});

describe("a whole game, typed", () => {
  for (const drawCount of [1, 3] as const) {
    it(`wins a draw-${drawCount} deal with no pointer anywhere`, () => {
      const seed = drawCount === 1 ? 3 : 15;
      const player = new Player(seed, drawCount);
      const line = playGreedily(deal(seed, drawCount)).moves;
      assert.ok(line.length > 100, "a win worth calling a game");

      for (const [index, move] of line.entries()) {
        const before = player.game.state.moves;
        typeMove(player, move);
        assert.equal(
          player.game.state.moves,
          before + 1,
          `move ${index} (${move.kind}) did not happen`,
        );
      }

      assert.ok(isWon(player.game.state), "the typed game did not finish");
      assert.equal(player.game.isWon, true);
      assert.equal(player.held, null, "nothing left in hand");
    });
  }
});
