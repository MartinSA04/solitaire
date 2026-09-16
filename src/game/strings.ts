import {
  type Card,
  type Column,
  type GameState,
  type Move,
  type Rank,
  type Suit,
  rankOf,
  suitOf,
  topOf,
  turnsOverCard,
} from "../engine/index.ts";
import { type PileRef } from "./Layout.ts";

/**
 * Everything the game says — to a screen reader, and on the two occasions it
 * puts words on the screen.
 *
 * One module rather than strings inlined in components, per
 * docs/08-accessibility.md: there is no i18n in v1, but card names in
 * particular need per-language forms and nobody should have to go looking for
 * them. It is pure, which is the point — what the board announces after a move
 * is a unit test over two states and a move, not a browser with a screen
 * reader attached to it.
 *
 * Two rules run through all of it:
 *
 * - **Cards are spelled out.** "Queen of clubs", never "Q♣": every screen
 *   reader renders the suit glyphs differently and several render them as
 *   nothing at all.
 * - **Numbers are spelled out too**, for the same reason — "7" after a colon
 *   is read as an ordinal by some voices — and because these are sentences
 *   being spoken rather than a display being read.
 *
 * Announcements are terse on purpose. A verbose live region makes a game
 * unplayable: the speech has to be over before the next move.
 */

const RANK_WORDS: readonly string[] = [
  "ace",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "jack",
  "queen",
  "king",
];

const SUIT_WORDS: readonly string[] = ["clubs", "diamonds", "hearts", "spades"];

export function spokenRank(rank: Rank): string {
  return RANK_WORDS[rank] as string;
}

export function spokenSuit(suit: Suit): string {
  return SUIT_WORDS[suit] as string;
}

/** `"queen of clubs"`. Lower case: most of its uses are mid-sentence. */
export function spokenCard(card: Card): string {
  return `${spokenRank(rankOf(card))} of ${spokenSuit(suitOf(card))}`;
}

/** For a sentence that starts with one, or anything after a colon. */
export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ONES: readonly string[] = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS: readonly string[] = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

/**
 * A number as words. Nothing in the game legitimately exceeds four figures —
 * fifty-two cards, and a move count that would have to be a very long evening
 * — and past that it falls back to digits rather than growing a rule for a
 * case that doesn't happen.
 */
export function words(value: number): string {
  if (!Number.isFinite(value) || value < 0) return String(value);
  const n = Math.floor(value);
  if (n < 20) return ONES[n] as string;
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)] as string;
    const ones = n % 10;
    return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
  }
  if (n < 1000) {
    const hundreds = `${ONES[Math.floor(n / 100)]} hundred`;
    const rest = n % 100;
    return rest === 0 ? hundreds : `${hundreds} and ${words(rest)}`;
  }
  if (n < 10000) {
    const thousands = `${words(Math.floor(n / 1000))} thousand`;
    const rest = n % 1000;
    if (rest === 0) return thousands;
    return `${thousands} ${rest < 100 ? "and " : ""}${words(rest)}`;
  }
  return String(n);
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${words(count)} ${count === 1 ? one : many}`;
}

/** `"two minutes fourteen seconds"`. Lower case, like {@link spokenCard}. */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const parts: string[] = [];
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) parts.push(plural(hours, "hour"));
  if (minutes > 0) parts.push(plural(minutes, "minute"));
  // A game that took an exact number of minutes still says how long it took.
  if (seconds > 0 || parts.length === 0) parts.push(plural(seconds, "second"));
  return parts.join(" ");
}

// ------------------------------------------------------------ pile names

/**
 * How a pile is referred to *inside* a sentence — "to column four", "from the
 * waste". The foundations are one thing when you are moving a card there, so
 * this deliberately does not name the suit: which foundation a heart goes to
 * is not a decision anyone makes.
 */
export function pilePhrase(ref: PileRef): string {
  switch (ref.pile) {
    case "stock":
      return "the stock";
    case "waste":
      return "the waste";
    case "foundation":
      return "foundation";
    case "tableau":
      return `column ${words(ref.column + 1)}`;
  }
}

/**
 * A pile's accessible name: a complete, readable description of its state,
 * which is what a screen reader reads when focus lands on it. This is the
 * whole of the board's structure as far as a screen-reader user is concerned,
 * so it says everything a sighted player can see at a glance — how many cards,
 * how many of them are face down, and what is on top.
 *
 * The count of face-down cards is the one piece of information a sighted
 * player gets for free and a screen-reader user cannot infer, which is why it
 * is here and not in the live region.
 */
export function pileLabel(state: GameState, ref: PileRef): string {
  switch (ref.pile) {
    case "stock": {
      const remaining = state.stock.length;
      return remaining === 0
        ? "Stock. Empty."
        : `Stock. ${sentence(plural(remaining, "card"))} remaining.`;
    }
    case "waste": {
      const top = topOf(state.waste);
      return top === undefined
        ? "Waste. Empty."
        : `Waste. Top card: ${sentence(spokenCard(top))}.`;
    }
    case "foundation": {
      const name = `Foundation, ${spokenSuit(ref.suit)}.`;
      const top = topOf(state.foundations[ref.suit] as Card[]);
      return top === undefined
        ? `${name} Empty.`
        : `${name} Up to the ${spokenRank(rankOf(top))}.`;
    }
    case "tableau": {
      const column = state.tableau[ref.column] as Column;
      const name = `Tableau column ${words(ref.column + 1)}.`;
      const top = topOf(column.cards);
      if (top === undefined) return `${name} Empty.`;
      const down = column.down > 0 ? `, ${words(column.down)} face down` : "";
      return (
        `${name} ${sentence(plural(column.cards.length, "card"))}${down}. ` +
        `Top card: ${sentence(spokenCard(top))}.`
      );
    }
  }
}

/** What is in hand, or under the keyboard's selection: one card, or a run. */
export function runPhrase(cards: readonly Card[]): string {
  const bottom = cards[0];
  if (bottom === undefined) return "nothing";
  if (cards.length === 1) return spokenCard(bottom);
  return `${spokenCard(bottom)} and ${plural(cards.length - 1, "more", "more")}`;
}

// -------------------------------------------------------- announcements

export const NOT_LEGAL = "Not a legal move.";
export const RECYCLED = "Waste returned to stock.";
export const PUT_BACK = "Put back.";

/**
 * The one sentence the game ever puts *on screen*, and it is a fact about the
 * position rather than a loss screen — docs/02-game-spec.md is specific that
 * there is no losing. It is rendered in a `role="status"` element, so it is
 * its own announcement and never goes through the live region twice.
 */
export const NO_MOVES = "No moves left — undo, or try a new deal.";

/**
 * The keyboard's version of the menu's "are you sure": a second press, rather
 * than a dialog to tab into and back out of. It goes through the same
 * `role="status"` line as the sentence above, so it is heard as well as seen,
 * and it applies at the same number of moves the menu asks at.
 */
export const CONFIRM_NEW = "Press N again for a new deal.";
export const CONFIRM_REPLAY = "Press R again to replay this deal.";

/**
 * The shortcut overlay's table, which is docs/08-accessibility.md's table.
 *
 * It lives here rather than in the component because it is the one written
 * description of what `keyboard.ts` does, and a promise about a key is worth
 * exactly as much as the test that checks it — `test/game/keyboard.test.ts`
 * reads this list and presses every key in it.
 */
export const SHORTCUTS: readonly { keys: readonly string[]; what: string }[] =
  Object.freeze([
    { keys: ["←", "→"], what: "Move between piles" },
    { keys: ["↑", "↓"], what: "Take more or fewer cards from a column" },
    { keys: ["Space"], what: "Pick up, and put down" },
    { keys: ["Esc"], what: "Put back what you picked up" },
    { keys: ["S"], what: "Draw from the stock" },
    { keys: ["A"], what: "Send a card to its foundation" },
    { keys: ["H"], what: "Hint" },
    { keys: ["F"], what: "Finish, once the deal is won" },
    { keys: ["Z"], what: "Undo" },
    { keys: ["N"], what: "New deal" },
    { keys: ["R"], what: "Replay this deal" },
    { keys: ["?"], what: "This list" },
  ]);

/** The `aria-describedby` paragraph on the board. The key model, in one breath. */
export const BOARD_HELP =
  "Left and right arrow keys move between the thirteen piles. " +
  "Up and down arrows take more or fewer cards from a fanned column. " +
  "Space picks up and puts down, escape puts back. " +
  "S draws from the stock, A sends a card to its foundation, " +
  "H asks for a hint, Z undoes. Press question mark for every shortcut.";

/**
 * What a move sounds like. Asked with the position on both sides of it,
 * because the card that moved is only in the first and the card it turned over
 * is only in the second.
 */
export function announceMove(
  before: GameState,
  after: GameState,
  move: Move,
): string {
  switch (move.kind) {
    case "draw":
      return announceDraw(before, after);
    case "recycle":
      return RECYCLED;
    case "wasteToFoundation":
    case "tableauToFoundation": {
      const card = movedCard(before, move);
      return `${sentence(spokenCard(card))} to foundation.${turned(before, after, move)}`;
    }
    default: {
      const cards = movedCards(before, move);
      const to = (move as { to: number }).to;
      return (
        `${sentence(runPhrase(cards))} to ${pilePhrase({ pile: "tableau", column: to })}.` +
        turned(before, after, move)
      );
    }
  }
}

/**
 * `"Drew queen of clubs."`, or in draw-3 the count and the one card that is
 * actually playable. A spent stock that turns nothing over is not silence —
 * it is the one case where pressing draw does nothing at all.
 */
function announceDraw(before: GameState, after: GameState): string {
  const turnedOver = after.waste.length - before.waste.length;
  const top = topOf(after.waste);
  if (turnedOver <= 0 || top === undefined) return "Stock is empty.";
  if (turnedOver === 1) return `Drew ${spokenCard(top)}.`;
  return `Drew ${words(turnedOver)}. Top card: ${sentence(spokenCard(top))}.`;
}

/**
 * The card a move uncovered, as its own short sentence. It is the half of a
 * move a player cares most about and the half they cannot see coming, so it is
 * announced every time rather than left to the pile label.
 */
function turned(before: GameState, after: GameState, move: Move): string {
  if (!turnsOverCard(before, move)) return "";
  const from = (move as { from: number }).from;
  const card = topOf((after.tableau[from] as Column).cards);
  return card === undefined ? "" : ` ${sentence(spokenCard(card))} turned up.`;
}

/** The cards a move picks up, bottom first — the run as it sits on the board. */
function movedCards(state: GameState, move: Move): Card[] {
  switch (move.kind) {
    case "wasteToTableau":
      return [topOf(state.waste) as Card];
    case "foundationToTableau":
      return [topOf(state.foundations[move.suit] as Card[]) as Card];
    case "tableauToTableau": {
      const column = state.tableau[move.from] as Column;
      return column.cards.slice(column.cards.length - move.count);
    }
    default:
      return [];
  }
}

function movedCard(state: GameState, move: Move): Card {
  return move.kind === "wasteToFoundation"
    ? (topOf(state.waste) as Card)
    : (topOf(
        (state.tableau[(move as { from: number }).from] as Column).cards,
      ) as Card);
}

/**
 * `"Undid. Jack of hearts back to column 2."` — said of the board as it is
 * once the move has been taken back, where the card is home again.
 *
 * A draw and a recycle have no card to name: undoing a draw-3 puts three cards
 * back, and naming them would be a list nobody asked for.
 */
export function announceUndo(restored: GameState, move: Move | null): string {
  if (move === null) return "Nothing to undo.";
  switch (move.kind) {
    case "draw":
      return "Undid the draw.";
    case "recycle":
      return "Undid the recycle.";
    case "wasteToFoundation":
      return `Undid. ${sentence(spokenCard(topOf(restored.waste) as Card))} back to the waste.`;
    case "foundationToTableau":
      return `Undid. ${sentence(spokenCard(topOf(restored.foundations[move.suit] as Card[]) as Card))} back to foundation.`;
    default: {
      const from = (move as { from: number }).from;
      const column = restored.tableau[from] as Column;
      const count = move.kind === "tableauToTableau" ? move.count : 1;
      const cards = column.cards.slice(column.cards.length - count);
      return `Undid. ${sentence(runPhrase(cards))} back to ${pilePhrase({ pile: "tableau", column: from })}.`;
    }
  }
}

/**
 * `"Hint: jack of hearts from column 2 to column 4."` — the move spelled out,
 * because the pulse on the board that accompanies it is not available to
 * everybody it is for.
 */
export function announceHint(state: GameState, move: Move): string {
  switch (move.kind) {
    case "draw":
      return "Hint: draw from the stock.";
    case "recycle":
      return "Hint: turn the waste back over.";
    case "wasteToFoundation":
      return `Hint: ${spokenCard(topOf(state.waste) as Card)} from the waste to foundation.`;
    case "tableauToFoundation":
      return `Hint: ${spokenCard(movedCard(state, move))} from ${pilePhrase({ pile: "tableau", column: move.from })} to foundation.`;
    case "foundationToTableau":
      return `Hint: ${spokenCard(topOf(state.foundations[move.suit] as Card[]) as Card)} from foundation to ${pilePhrase({ pile: "tableau", column: move.to })}.`;
    case "wasteToTableau":
      return `Hint: ${spokenCard(topOf(state.waste) as Card)} from the waste to ${pilePhrase({ pile: "tableau", column: move.to })}.`;
    case "tableauToTableau":
      return (
        `Hint: ${runPhrase(movedCards(state, move))} from ${pilePhrase({ pile: "tableau", column: move.from })} ` +
        `to ${pilePhrase({ pile: "tableau", column: move.to })}.`
      );
  }
}

/** Picked up, and what is in hand. Said because nothing else says it. */
export function announcePickup(cards: readonly Card[]): string {
  return `Picked up ${runPhrase(cards)}.`;
}

/** What the keyboard's selection covers, as it grows and shrinks up a column. */
export function announceSelection(cards: readonly Card[]): string {
  return cards.length === 0 ? "Empty." : sentence(`${runPhrase(cards)}.`);
}

/**
 * Assertive, and fired at Stage 0 — the moment the game is won, not thirteen
 * seconds later when the cascade has finished. Nobody is made to wait through
 * a decoration to be told they won.
 */
export function announceWin(elapsedMs: number, moves: number): string {
  return `You won. ${sentence(spokenDuration(elapsedMs))}, ${plural(moves, "move")}.`;
}
