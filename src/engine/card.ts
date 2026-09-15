/**
 * A card is a plain integer in `0..51` — not an object.
 *
 * ```text
 * rank = card % 13         0 = Ace … 12 = King
 * suit = (card / 13) | 0   0 = ♣, 1 = ♦, 2 = ♥, 3 = ♠
 * red  = suit is ♦ or ♥
 * ```
 *
 * Piles are therefore arrays of small integers: an undo snapshot is cheap, the
 * solver can hash a position without walking objects, and card equality is
 * `===`.
 *
 * Face-up-ness is deliberately *not* here. It is a property of position, and
 * lives as a per-column count of face-down cards on the tableau — see state.ts.
 *
 * This numbering is part of the frozen deal invariant (see deal.ts): the
 * shuffle permutes `[0..51]`, so renumbering the suits would silently change
 * every deal number in existence.
 */

export type Card = number;

/** 0 = ♣, 1 = ♦, 2 = ♥, 3 = ♠. */
export type Suit = 0 | 1 | 2 | 3;

/** 0 = Ace … 12 = King. */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const DECK_SIZE = 52;
export const RANK_COUNT = 13;
export const SUIT_COUNT = 4;

export const CLUBS: Suit = 0;
export const DIAMONDS: Suit = 1;
export const HEARTS: Suit = 2;
export const SPADES: Suit = 3;

export const ACE: Rank = 0;
export const KING: Rank = 12;

export function rankOf(card: Card): Rank {
  return (card % RANK_COUNT) as Rank;
}

export function suitOf(card: Card): Suit {
  return ((card / RANK_COUNT) | 0) as Suit;
}

export function isRed(card: Card): boolean {
  const suit = suitOf(card);
  return suit === DIAMONDS || suit === HEARTS;
}

export function cardOf(suit: Suit, rank: Rank): Card {
  return suit * RANK_COUNT + rank;
}

/** The two suits of the opposite colour to `suit`, ♣♠ for a red card and ♦♥ for a black one. */
export function oppositeSuits(suit: Suit): readonly [Suit, Suit] {
  return suit === DIAMONDS || suit === HEARTS
    ? [CLUBS, SPADES]
    : [DIAMONDS, HEARTS];
}

/**
 * Can `card` be stacked on `onto` in the tableau — one rank lower, opposite
 * colour? The single alternating-colour rule, used both for drops and for
 * deciding whether a run is properly sequenced.
 */
export function canStack(card: Card, onto: Card): boolean {
  return rankOf(card) === rankOf(onto) - 1 && isRed(card) !== isRed(onto);
}

/** `[0, 1, … 51]` — the deck before it is shuffled. */
export function orderedDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

/**
 * Index a pile whose bounds the caller has already established — every use
 * sits behind a length check or an `isLegal` call. It exists because
 * `noUncheckedIndexedAccess` is on, which is worth having everywhere else.
 */
export function cardAt(pile: readonly Card[], index: number): Card {
  return pile[index] as Card;
}

const RANK_NAMES = "A23456789TJQK";
const SUIT_SYMBOLS = "♣♦♥♠";

/** Debug and test output only. The UI looks cards up by number, never by name. */
export function cardName(card: Card): string {
  return `${RANK_NAMES[rankOf(card)]}${SUIT_SYMBOLS[suitOf(card)]}`;
}
