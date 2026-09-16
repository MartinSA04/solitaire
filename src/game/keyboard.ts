import {
  type Card,
  type Column,
  type GameState,
  type Move,
  faceUpCount,
  isLegal,
} from "../engine/index.ts";
import {
  type Hit,
  type PileRef,
  PILE_ORDER,
  pileCards,
  samePile,
} from "./Layout.ts";
import { autoMove } from "./automove.ts";
import { type Grab, dropMove, grab } from "./pickup.ts";

/**
 * The keyboard model from docs/08-accessibility.md, as pure data.
 *
 * A **roving focus** over the thirteen piles, with its own arrow-key grammar —
 * not fifty-two tab stops. `Tab` never enters the board; the board is one
 * composite widget, which is what the ARIA practices prescribe for anything
 * grid-shaped and what anyone who has tabbed through fifty-two cards once will
 * tell you.
 *
 * Nothing here touches the DOM or the game. `interpret` takes a key press and
 * a position and returns *what the player meant*; `Game.svelte` is what makes
 * it happen. That is what lets `test/game/keyboard.test.ts` play a complete
 * game to a win through this module with no browser anywhere near it — which
 * is the milestone's bar, tested at the level the bar is actually about.
 *
 * The same model serves a screen reader: focus moving to a pile is what makes
 * it read its label, so there is no second navigation model to keep in step.
 */

/**
 * The thirteen positions are {@link PILE_ORDER}, which lives in Layout.ts
 * because the board's structure is the board's — the keyboard walks that list,
 * the thirteen slot elements are rendered from it, and hit-testing sweeps it.
 * Three copies of one list would be three things to keep in step.
 */
export interface Focus {
  /** Index into {@link PILE_ORDER}. */
  at: number;
  /**
   * How far up the focused column's fanned run the selection reaches, counting
   * the top card as one. Meaningless anywhere but the tableau, where only the
   * top card is ever in play, and clamped to 1 there so that nothing has to
   * ask which kind of pile it is holding.
   */
  reach: number;
}

/** The stock, which is where a game starts and the only pile that is never empty at the deal. */
export const FIRST_FOCUS: Focus = Object.freeze({ at: 0, reach: 1 });

export function pileAt(focus: Focus): PileRef {
  return PILE_ORDER[focus.at] as PileRef;
}

/**
 * How many cards the focus *could* reach: a tableau column's face-up run, and
 * one card everywhere else. A face-down card is not yours to select, and the
 * face-up part of a column is always a properly sequenced run in any reachable
 * position — see pickup.ts.
 */
export function reachable(state: GameState, ref: PileRef): number {
  if (ref.pile === "tableau") {
    return faceUpCount(state.tableau[ref.column] as Column);
  }
  return Math.min(1, pileCards(state, ref).length);
}

/**
 * A focus the board can honour. Every move changes what is under the focus —
 * a column can empty, a run can be carried off — so this is applied after
 * anything that changes the position rather than trusted to stay true.
 */
export function clampFocus(state: GameState, focus: Focus): Focus {
  const at = Math.min(PILE_ORDER.length - 1, Math.max(0, focus.at));
  const most = reachable(state, PILE_ORDER[at] as PileRef);
  return { at, reach: Math.min(Math.max(1, focus.reach), Math.max(1, most)) };
}

/** The cards the focus covers, bottom first — empty on an empty pile. */
export function focusedCards(state: GameState, focus: Focus): Card[] {
  const ref = pileAt(focus);
  const cards = pileCards(state, ref);
  const reach = Math.min(focus.reach, reachable(state, ref));
  return reach <= 0 ? [] : cards.slice(cards.length - reach);
}

/** The focus as a {@link Hit}, so a keyboard pickup is the same code a tap is. */
export function focusedHit(state: GameState, focus: Focus): Hit {
  const ref = pileAt(focus);
  const cards = pileCards(state, ref);
  const reach = Math.min(focus.reach, reachable(state, ref));
  const index = reach <= 0 ? -1 : cards.length - reach;
  return { ref, index, card: index < 0 ? null : (cards[index] as Card) };
}

export type Command =
  "undo" | "hint" | "finish" | "newDeal" | "replay" | "help";

/**
 * What a key press meant. The caller plays moves, moves focus and speaks; it
 * never has to work out which of those a key was.
 */
export type Action =
  /** `←` `→` — a different pile, which is also what a screen reader reads. */
  | { kind: "focus"; focus: Focus }
  /** `↑` `↓` — the same pile, a different number of cards. */
  | { kind: "select"; focus: Focus }
  | { kind: "pick"; held: Grab }
  /** `Escape`, or putting a pickup back down where it came from. */
  | { kind: "release" }
  | { kind: "play"; move: Move }
  /** A press that meant something the position doesn't allow. */
  | { kind: "refuse"; card: Card | null }
  | { kind: "command"; name: Command };

/**
 * A key press — shaped like a `KeyboardEvent` so the real one can be handed
 * straight in, and so a test can write the three fields it cares about.
 */
export interface Press {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** Tapping the stock: one gesture, and `S` is the keyboard's version of it. */
const STOCK_HIT: Hit = { ref: { pile: "stock" }, index: -1, card: null };

const COMMANDS: Readonly<Record<string, Command>> = {
  f: "finish",
  z: "undo",
  h: "hint",
  n: "newDeal",
  r: "replay",
  "?": "help",
};

/**
 * A key press, against a position. `null` means the key was not ours and the
 * browser should have it — which is most of them, and is why nothing here
 * calls `preventDefault` for the caller.
 *
 * `held` is what the player has picked up, which is deliberately not part of
 * {@link Focus}: you pick a card up, walk the focus to where it is going, and
 * put it down. The focus moves; the hand does not.
 */
export function interpret(
  press: Press,
  state: GameState,
  focus: Focus,
  held: Grab | null,
): Action | null {
  if (press.altKey === true) return null;

  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key;
  const chorded = press.ctrlKey === true || press.metaKey === true;

  // `Ctrl+Z` is undo everywhere, so it is undo here. Every other letter is a
  // browser shortcut with a modifier on it and none of our business.
  if (chorded) return key === "z" ? { kind: "command", name: "undo" } : null;

  switch (key) {
    case "ArrowLeft":
      return { kind: "focus", focus: step(state, focus, -1) };
    case "ArrowRight":
      return { kind: "focus", focus: step(state, focus, +1) };
    case "ArrowUp":
      return extend(state, focus, held, +1);
    case "ArrowDown":
      return extend(state, focus, held, -1);
    case "Escape":
      return held === null ? null : { kind: "release" };
    case " ":
    case "Enter":
      return activate(state, focus, held);
    case "s":
      return held === null ? stock(state) : null;
    case "a":
      return held === null ? sendHome(state, focus) : null;
    default: {
      const command = COMMANDS[key];
      return command === undefined ? null : { kind: "command", name: command };
    }
  }
}

/**
 * The focus wraps. Thirteen piles is a ring you scan rather than a list you
 * walk off the end of, and getting stuck at the stock while looking for column
 * seven is the kind of thing that makes people stop using the keyboard.
 *
 * Arriving at a pile always selects its top card: a reach carried over from
 * the column you left would mean the selection changing under a key that only
 * said "right".
 */
function step(state: GameState, focus: Focus, delta: number): Focus {
  const count = PILE_ORDER.length;
  const at = (focus.at + delta + count) % count;
  return clampFocus(state, { at, reach: 1 });
}

/**
 * `↑` takes one more card off the run, `↓` puts one back. Up is *into* the
 * column because the column fans downward: the card above the one you have is
 * the one further up the screen.
 *
 * It does nothing on a pile with one card in play, and nothing at all with a
 * pickup in hand — the cards are not on the board to be selected any more.
 */
function extend(
  state: GameState,
  focus: Focus,
  held: Grab | null,
  delta: number,
): Action | null {
  if (held !== null) return null;
  const most = reachable(state, pileAt(focus));
  const reach = focus.reach + delta;
  if (reach < 1 || reach > most) return null;
  return { kind: "select", focus: { at: focus.at, reach } };
}

/**
 * `Space` and `Enter`: pick up, or put down. Which one it is depends only on
 * whether anything is in hand, which is the whole of the interaction and the
 * reason it needs no modifier.
 */
function activate(
  state: GameState,
  focus: Focus,
  held: Grab | null,
): Action | null {
  const ref = pileAt(focus);

  if (held === null) {
    // The stock has exactly one gesture, and this is the keyboard's hand on it.
    if (ref.pile === "stock") return stock(state);
    const taken = grab(state, focusedHit(state, focus));
    return taken === null
      ? { kind: "refuse", card: null }
      : { kind: "pick", held: taken };
  }

  // Put back where it came from: a cancel, not a refusal. Pressing space twice
  // on the same pile has to be harmless or nobody will risk the first press.
  if (samePile(held.from, ref)) return { kind: "release" };

  const move = dropMove(state, held, ref);
  return move === null
    ? { kind: "refuse", card: held.cards[0] ?? null }
    : { kind: "play", move };
}

function stock(state: GameState): Action {
  const move = autoMove(state, STOCK_HIT);
  return move === null || !isLegal(state, move)
    ? { kind: "refuse", card: null }
    : { kind: "play", move };
}

/**
 * `A` — the card under the focus, home. It is the shortcut that makes a
 * keyboard game finishable at a reasonable speed, and it is the keyboard's
 * half of tap-to-auto-move: one key, the obvious destination, no aiming.
 *
 * A run cannot go to a foundation, so a reach of more than one is a refusal
 * rather than a silent move of the top card — quietly doing something other
 * than what was asked is worse than saying no.
 */
function sendHome(state: GameState, focus: Focus): Action | null {
  const ref = pileAt(focus);
  const cards = focusedCards(state, focus);
  const card = cards[0] ?? null;

  let move: Move | null = null;
  if (ref.pile === "waste") move = { kind: "wasteToFoundation" };
  else if (ref.pile === "tableau" && cards.length === 1) {
    move = { kind: "tableauToFoundation", from: ref.column };
  }

  if (move === null || !isLegal(state, move)) return { kind: "refuse", card };
  return { kind: "play", move };
}
