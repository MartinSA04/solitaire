import { type Card, rankOf, suitOf } from "../engine/index.ts";

/**
 * Decks we did not draw: a sprite of card faces, its licence, and how to find
 * one card in it.
 *
 * Everything here is data. It is imported by the card layer, which fetches the
 * sprite and points 52 `<use>` elements at it, and by /credits, which is where
 * the licence obligations are honoured — one registry, so a deck cannot ship
 * without appearing on that page.
 *
 * ## What ended up here, and what didn't
 *
 * docs/04-art-direction.md names three candidates and puts **Classic** (Byron
 * Knoll's public-domain deck) first, as the safe default. Measuring it settled
 * that differently: its court cards are traced bitmaps — `KC.svg` alone is
 * 1.1MB, and the 52 come to **8MB**, about 2MB gzipped. That is sixty times
 * the sprite budget in docs/07 and not a thing to put on a phone on 4G,
 * whatever its licence says.
 *
 * **Traditional** (Chris Aguilar's Vectorized Playing Cards) is the handsomest
 * of the three and is not here for a different reason: its canonical download
 * sits behind a download manager, and the copies on GitHub are exports of an
 * export. Its licence demands a specific attribution string, and taking a deck
 * whose licence has an exact obligation from a source we cannot verify is
 * precisely the wrong way to honour it.
 *
 * **French** — David Bellot's SVG-cards, maintained by Huub de Beer — is what
 * ships. It is genuinely vector, it is *already* a single sprite of 52 groups,
 * and it comes from a source we can name. It is 962KB, 339KB over the wire,
 * which is still ten times what docs/07 budgeted for a sprite; that budget was
 * written when a sourced deck was expected to be the default. It isn't: ours
 * is, this one is fetched only when somebody asks for it, and nothing about
 * the first load touches it.
 */

export interface SourcedDeck {
  /** The `[data-deck]` value, and the directory under `public/decks/`. */
  id: string;
  /** What the settings sheet calls it. */
  name: string;
  /** The sprite, served as its own file and never inlined into the bundle. */
  sprite: string;
  /** One card's box inside the sprite. */
  viewBox: string;
  /**
   * The colour of the paper the deck draws its own card base in. Our corner
   * index sits on a patch of it, so a mismatch shows as a square of the wrong
   * white in the corner of every card.
   */
  paper: string;
  /** The id of a card's group within the sprite. */
  symbol: (card: Card) => string;
  credit: Credit;
}

export interface Credit {
  name: string;
  /** Who drew it, in the form the licence header gives. */
  authors: string[];
  licence: string;
  /** Where it came from, for anyone who wants the original. */
  source: string;
  /** The licence text as we ship it, verbatim, on our own origin. */
  licenceUrl?: string;
  /**
   * A string a licence *requires* be displayed, verbatim. Rendered as given —
   * no reflowing, no abbreviating, no "see below".
   */
  required?: string;
  note?: string;
}

const SUIT_NAMES = ["club", "diamond", "heart", "spade"] as const;
const COURT_NAMES = ["jack", "queen", "king"] as const;

/**
 * `club_1` … `club_10`, `club_jack`, `club_queen`, `club_king`, and the same
 * for the other three suits. Ace is `_1` in this deck rather than `_ace`.
 */
function bellotSymbol(card: Card): string {
  const rank = rankOf(card);
  const suit = SUIT_NAMES[suitOf(card)] as string;
  const face =
    rank < 10 ? String(rank + 1) : (COURT_NAMES[rank - 10] as string);
  return `${suit}_${face}`;
}

export const SOURCED: readonly SourcedDeck[] = [
  {
    id: "french",
    name: "French",
    sprite: "/decks/french/deck.svg",
    // 169.075 × 244.64 is 1 : 1.447, against the 1 : 1.4 of a poker card. The
    // three per cent goes into the height rather than cropping the border off.
    viewBox: "0 0 169.075 244.640",
    paper: "#ffffff",
    symbol: bellotSymbol,
    credit: {
      name: "French (SVG-cards 4.0.2)",
      authors: ["David Bellot", "Huub de Beer"],
      licence: "GNU LGPL, version 2.1 or later",
      source: "https://svg-cards.sourceforge.net/",
      licenceUrl: "/decks/french/LICENSE.txt",
      note: "The GNOME and Aisleriot deck, used unmodified. It is the one deck here that is a download — about 340KB, fetched only if you choose it.",
    },
  },
];

export function sourcedDeck(id: string): SourcedDeck | undefined {
  return SOURCED.find((deck) => deck.id === id);
}

/**
 * The decks we draw ourselves. They are CSS rather than assets, so there is no
 * sprite and no licence to honour — and they are on the credits page anyway,
 * because a credits page that lists only what it is obliged to list tells the
 * reader nothing about where the rest came from.
 */
export const OURS: readonly Credit[] = [
  {
    name: "Minimal",
    authors: ["This project"],
    licence: "MIT, with the rest of the site",
    source: "src/decks/minimal.css",
    note: "Rank and suit set in the table's own typeface. No court illustration, and nothing to download.",
  },
  {
    name: "High contrast",
    authors: ["This project"],
    licence: "MIT, with the rest of the site",
    source: "src/decks/high-contrast.css",
    note: "Minimal's geometry at maximum weight, on a pure white card.",
  },
  {
    name: "Four colour",
    authors: ["This project"],
    licence: "MIT, with the rest of the site",
    source: "src/decks/four-colour.css",
    note: "♠ black, ♥ red, ♦ blue, ♣ green.",
  },
  {
    name: "Card backs — Lattice, Dot grid, Solid",
    authors: ["This project"],
    licence: "MIT, with the rest of the site",
    source: "src/decks/backs.css",
    note: "Gradients, recoloured by whichever table is on.",
  },
];
