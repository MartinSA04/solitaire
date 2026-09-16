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
    /*
     * **Not the sprite's own viewBox**, which is what shipped first and is why
     * the French deck looked broken: every card was drawn small and high
     * inside its element, with the deck's own black border cutting across the
     * face on two edges and its bottom-right index falling off the corner.
     *
     * Two things are wrong with the declared 169.075 × 244.640. The first is
     * that 8.12 units of that height are bleed: a card in this file is the
     * `#base` path, x from 1.25 to 167.825 and y from 1.25 to 236.52, with a
     * 2.5-wide stroke centred on that outline. The second is that `#base` is a
     * whole card — white paper, rounded corners, black edge — and so is the
     * element it is being drawn into. Two cards, one drawn by a stylesheet at
     * an 8px radius and one by a 19th-century engraving at 4.5px, cannot be
     * made to coincide; and because our `.card-face` clips to its own rounded
     * rectangle, which edge of the drawn one survived depended on where the
     * card happened to land on the pixel grid.
     *
     * So this crops to the *inside* of the deck's own border — x 2.5 to
     * 166.575, y 2.5 to 235.27 — and the deck's paper, corners and edge are
     * simply not drawn. What is left is the engraving, on the card this
     * product draws for every other deck. `--art-paper` (below) is what that
     * card is then filled with, so the sliver of it visible at each corner is
     * this deck's white rather than the table's.
     *
     * 164.075 × 232.77 is 1 : 1.419 against the 1 : 1.4 of a poker card, so
     * `preserveAspectRatio="none"` stretches it by a bit over one per cent.
     */
    viewBox: "2.5 2.5 164.075 232.770",
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
    name: "Classic",
    authors: ["This project"],
    licence: "MIT, with the rest of the site",
    source: "src/decks/classic.css",
    note: "Minimal's geometry set in a book serif, with a printed card's crimson. It takes the table's own card colour.",
  },
  {
    name: "Vintage",
    authors: ["This project"],
    licence: "MIT, with the rest of the site",
    source: "src/decks/vintage.css",
    note: "A serif rank in sepia on ivory board. It brings its own paper, so it is the same deck on every table.",
  },
  {
    name: "Card backs — Lattice, Argyle, Pinstripe, Ripple, Dot grid, Solid",
    authors: ["This project"],
    licence: "MIT, with the rest of the site",
    source: "src/decks/backs.css",
    note: "Gradients, recoloured by whichever table is on. A back belongs to its deck rather than being chosen separately, so there is one per deck.",
  },
];
