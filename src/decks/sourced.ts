import { type Card, rankOf, suitOf } from "../engine/index.ts";

/**
 * Decks we did not draw: a sprite of card faces, its licence, and where each
 * card is inside it.
 *
 * Everything here is data. It is imported by the card layer, which fetches the
 * sprite and points 52 `<use>` elements at it, by the deck gallery, which
 * shows what a deck costs before anyone pays for it, and by /credits, which is
 * where the licence obligations are honoured — one registry, so a deck cannot
 * ship without appearing on that page.
 *
 * ## Where these came from
 *
 * docs/04-art-direction.md used to record that a second sourced deck had been
 * looked for and not found. It had been looked for in the wrong place. The
 * search was through deck *projects* — Byron Knoll's, Chris Aguilar's,
 * saulspatz's, RevK's — and every one of them fails on size or on provenance:
 * 8MB of traced bitmaps, or a download behind a manager, or 52 separate files
 * out of a CGI that we would have to assemble ourselves.
 *
 * The decks below come from **GNOME Aisleriot's card themes**, which is where
 * that work has already been done and done properly: each is a single SVG
 * sheet, each ships a README naming everybody who drew it and the licence the
 * art arrived under, and — the part that makes this cheap — every one of them
 * names its card groups `club_7`, `spade_king`, `diamond_1`, which is the
 * convention {@link bellotSymbol} was already generating for the French deck.
 * Adding one is an entry in this file and two files in `public/decks/`.
 *
 * They are also, mostly, *small*: the French deck is 339KB over the wire and
 * eleven of the fifteen below are under 100KB, four of them under 8KB. A
 * sourced deck is still never a first load — nothing is fetched until somebody
 * asks for it — but "a sourced deck is expensive" stopped being true.
 *
 * ## What is not here
 *
 * - **XSkat** and **Swiss XVII**, which are handsome and are German- and
 *   Swiss-suited. Klondike is built on alternating red and black; a deck with
 *   acorns, leaves, bells and hearts is not a deck this game can be played
 *   with, which is a different objection from not liking the look of it.
 * - **Tigullio**, whose groups do not resolve to a card box — most of its
 *   cards render blank through the mechanism every other deck here works
 *   through. Held back rather than bodged.
 * - **Adler, Clubkarte, L & H, Mittelalter, Tragy, Tarot**: JPEG court cards,
 *   0.7 to 1.7MB. That is Byron Knoll's rejection again and it has not moved.
 * - **Classic** (Byron Knoll) and **Traditional** (Chris Aguilar), for the
 *   reasons docs/04 gives: 8MB of traced bitmap, and an exact attribution
 *   string we would be honouring from a source we cannot verify.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the 52 cards are on the sheet.
 *
 * These sprites are **contact sheets** — thirteen ranks across, four suits
 * down — so `<use href="#club_7">` draws that card at its place on the sheet
 * rather than at the origin, and showing one card means pointing a viewBox at
 * its rectangle. What is committed is the lattice rather than 52 rectangles:
 * an origin, a cell, the two steps, and which row each suit is drawn on.
 *
 * The numbers are measured in a browser by `scripts/deck-geometry.ts`, never
 * worked out from the sheet's viewBox — several of these sheets carry a fifth
 * row for the back and the jokers, and some bleed their art outside the cell
 * it nominally occupies, so dividing by thirteen and four gives a plausible
 * wrong answer. That script takes `--verify` to re-measure every deck here and
 * check the committed rectangles still lie inside the drawn ones.
 *
 * The French deck is the degenerate case and needs no special path: its sheet
 * draws every card at the same coordinates, so its steps are zero and the
 * formula below says "always this rectangle".
 */
export interface Grid extends Box {
  /** Between one rank and the next. Zero if every card is drawn in one place. */
  dx: number;
  /** Between one suit's row and the next. */
  dy: number;
  /** Which row each suit is on, in this codebase's suit order. */
  rows: readonly [number, number, number, number];
}

export interface SourcedDeck {
  /** The `[data-deck]` value, and the directory under `public/decks/`. */
  id: string;
  /** What the deck gallery calls it. */
  name: string;
  /** The sprite, served as its own file and never inlined into the bundle. */
  sprite: string;
  /** Where each card is inside it. */
  grid: Grid;
  /**
   * The back this deck is printed on, if we use it — every one of these
   * sprites carries one, and a deck arriving with the back it was printed on
   * is what docs/04 means by a back belonging to its deck. `null` keeps one of
   * ours, which is also what happens to any deck whose sprite fails to arrive.
   */
  back: Box | null;
  /**
   * The colour of the paper the deck draws its own card base in. The two or
   * three pixels of card visible at each rounded corner are filled with it, so
   * a mismatch shows as four small chips of the wrong white on every card.
   */
  paper: string;
  /**
   * The ink our corner index takes on this deck, when a player turns that
   * setting on. Only decks whose paper is dark need to say — see
   * `Settings.cardIndex`, which is off by default because a sourced deck is
   * somebody's drawing and the default should be to show it.
   */
  ink?: string;
  /** Gzipped bytes, which is what a player on 4G actually waits for. */
  bytes: number;
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
 * for the other three suits. Ace is `_1` rather than `_ace`.
 *
 * Named after David Bellot because svg-cards is where it comes from, and kept
 * as one function because every deck in this file inherited that convention
 * from it — which is the single reason this registry is data and not code.
 */
function bellotSymbol(card: Card): string {
  const rank = rankOf(card);
  const suit = SUIT_NAMES[suitOf(card)] as string;
  const face =
    rank < 10 ? String(rank + 1) : (COURT_NAMES[rank - 10] as string);
  return `${suit}_${face}`;
}

/** The rectangle to point one card's viewBox at. */
export function cardBox(deck: SourcedDeck, card: Card): Box {
  const { x, y, w, h, dx, dy, rows } = deck.grid;
  return {
    x: x + rankOf(card) * dx,
    y: y + (rows[suitOf(card)] as number) * dy,
    w,
    h,
  };
}

/** A box as a viewBox attribute. */
export function viewBox(box: Box): string {
  return `${box.x} ${box.y} ${box.w} ${box.h}`;
}

/**
 * How tall a card is against its own width, for the deck in hand.
 *
 * A poker card is 1.4. The sixteen sheets here run from 1.36 to 1.57, because
 * a Russian pattern and a bridge pattern and an 18th-century woodblock are
 * different shapes of card, and each of these was drawn at the shape its
 * pattern is printed at. The board takes this number from the deck and lays
 * the table out at it, so what a player sees is the proportion the artist
 * drew. See docs/04-art-direction.md.
 */
export function deckAspect(deck: SourcedDeck): number {
  return deck.grid.h / deck.grid.w;
}

/**
 * Everything below `french` comes from one place and shares one shape, so the
 * common half is written once: the Aisleriot source, the licence file beside
 * the sprite, and the id convention. What is left per deck is what is actually
 * different about it.
 */
function aisleriot(deck: {
  id: string;
  name: string;
  grid: Grid;
  back: Box | null;
  paper: string;
  ink?: string;
  bytes: number;
  authors: string[];
  licence: string;
  note: string;
}): SourcedDeck {
  const { authors, licence, note, ...rest } = deck;
  return {
    ...rest,
    sprite: `/decks/${deck.id}/deck.svg`,
    symbol: bellotSymbol,
    credit: {
      name: `${deck.name} (GNOME Aisleriot)`,
      authors,
      licence,
      source: "https://gitlab.gnome.org/GNOME/aisleriot/-/tree/master/cards",
      licenceUrl: `/decks/${deck.id}/LICENSE.txt`,
      note,
    },
  };
}

/** The suit rows, in the order every one of these sheets draws them. */
const SHEET_ROWS = [0, 1, 2, 3] as const;

export const SOURCED: readonly SourcedDeck[] = [
  aisleriot({
    id: "minium",
    name: "Minium",
    // Its art bleeds past its own card — the ink measures 103.75 × 144.25 in a
    // cell 100 × 141 — so this is the sheet's own `#card`, not what the cards
    // measure. Taking the ink would show a sliver of the next card along.
    grid: { x: 1, y: 1, w: 98, h: 138, dx: 100, dy: 140, rows: SHEET_ROWS },
    back: { x: 201, y: 561, w: 98, h: 138 },
    paper: "#ffffff",
    bytes: 3581,
    authors: ["Vincent Bermel"],
    licence: "GNU LGPL, version 3 or later",
    note: "No court illustration — one oversized index and one pip, which makes it the most legible deck here at phone size. 3.5KB, which is less than this sentence's share of the page.",
  }),
  aisleriot({
    id: "minium-dark",
    name: "Minium dark",
    grid: { x: 1, y: 1, w: 98, h: 138, dx: 100, dy: 140, rows: SHEET_ROWS },
    back: { x: 201, y: 561, w: 98, h: 138 },
    // The one deck here printed on a dark card. Our index, if a player turns
    // it on, has to be light or it is a dark square in the corner.
    paper: "#333333",
    ink: "#f2f2f2",
    bytes: 3598,
    authors: ["Vincent Bermel"],
    licence: "GNU LGPL, version 3 or later",
    note: "Minium printed on a dark card. The only deck here that brings its own night, and it suits the Dark table.",
  }),
  aisleriot({
    id: "simplistic",
    name: "Simplistic",
    grid: {
      x: -104.99,
      y: -163.51,
      w: 211,
      h: 328,
      dx: 212.98,
      dy: 329.98,
      rows: SHEET_ROWS,
    },
    back: { x: 320.96, y: 1156.4, w: 211, h: 328 },
    paper: "#ffffff",
    bytes: 5546,
    authors: ["Vincent Bermel", "Adrian Kennard"],
    licence: "GNU LGPL, version 3 or later",
    note: "Index only, twice per card, out of Adrian Kennard's CC0 card generator — the deck docs/04 turned down when it was 52 separate files, arriving as one sheet somebody else published.",
  }),
  aisleriot({
    id: "tango-nuevo",
    name: "Tango Nuevo",
    // More than half its cards draw courts that overflow the card, so the
    // median ink box is bigger than the card. These are the cell the back is
    // drawn at, which is the honest rectangle.
    grid: { x: 1, y: 1, w: 140, h: 190, dx: 145, dy: 195, rows: SHEET_ROWS },
    back: { x: 291, y: 781, w: 140, h: 190 },
    paper: "#f2f1ee",
    bytes: 7468,
    authors: ["Frederik Elwert", "thom-10", "Vincent Bermel"],
    licence: "GNU GPL, version 3 or later",
    note: "Flat courts in the Tango palette on a warm white card. Descended from the GNOME desktop's own Tango deck.",
  }),
  aisleriot({
    id: "pixelangelo-compact",
    name: "Pixelangelo Compact",
    grid: { x: 0, y: 0, w: 50, h: 74, dx: 50, dy: 74, rows: SHEET_ROWS },
    back: { x: 100, y: 296, w: 50, h: 74 },
    paper: "#ffffff",
    bytes: 13612,
    authors: ["Vincent Bermel"],
    licence: "GNU LGPL, version 3 or later",
    note: "A traditional deck in 13KB. Its courts are small embedded rasters, so it is at its best on a phone and soft on a large screen.",
  }),
  aisleriot({
    id: "pixelangelo",
    name: "Pixelangelo",
    grid: { x: 0, y: 0, w: 73, h: 109, dx: 73, dy: 109, rows: SHEET_ROWS },
    back: { x: 146, y: 436, w: 73, h: 109 },
    paper: "#ffffff",
    bytes: 20080,
    authors: ["Vincent Bermel", "Heiko Eissfeldt", "Michael Bischoff"],
    licence: "GNU GPL, version 3 or later",
    note: "The court cards from the old Bonded deck that shipped with Unix solitaire in the nineties, embedded as rasters. Soft above phone size, and a straight line back to 1994.",
  }),
  aisleriot({
    id: "ornamental",
    name: "Ornamental",
    grid: { x: 0, y: 0, w: 139, h: 189, dx: 139, dy: 189, rows: SHEET_ROWS },
    back: { x: 278, y: 756, w: 139, h: 189 },
    // Ivory board with rounded, transparent corners — so this colour is what
    // shows at each corner of our card rather than the table's.
    paper: "#eef1d4",
    bytes: 20792,
    authors: ["Vincent Bermel", "Nicu Buculei"],
    licence: "GNU GPL, version 3 or later",
    note: "Storybook courts on ivory board, revised from Nicu Buculei's public-domain original.",
  }),
  aisleriot({
    id: "plastic",
    name: "Plastic",
    grid: {
      x: 0.5,
      y: 0.5,
      w: 100,
      h: 140,
      dx: 101,
      dy: 141,
      rows: SHEET_ROWS,
    },
    back: { x: 202.5, y: 564.5, w: 100, h: 140 },
    paper: "#ffffff",
    bytes: 21184,
    authors: ["Gifford Cheung", "Vincent Bermel"],
    licence: "GNU LGPL, version 3 or later",
    note: "Modern illustrated courts in red, black and gold, at an exact poker aspect — the only deck here that needs no stretching at all.",
  }),
  aisleriot({
    id: "neoclassical",
    name: "Neoclassical",
    grid: {
      x: 1.5,
      y: 1.5,
      w: 142,
      h: 213,
      dx: 145,
      dy: 216,
      rows: SHEET_ROWS,
    },
    back: { x: 291.5, y: 865.5, w: 142, h: 213 },
    paper: "#ffffff",
    bytes: 47482,
    authors: ["Charles Esquiaqui", "Vincent Bermel"],
    licence: "GNU LGPL, version 3 or later",
    note: "Flat, high-contrast courts drawn as shapes rather than engravings. The most legible of the illustrated decks at a small card.",
  }),
  aisleriot({
    id: "neoclassical-four-colour",
    name: "Neoclassical four-colour",
    grid: {
      x: 1.5,
      y: 1.5,
      w: 142,
      h: 213,
      dx: 145,
      dy: 216,
      rows: SHEET_ROWS,
    },
    back: { x: 291.5, y: 865.5, w: 142, h: 213 },
    paper: "#ffffff",
    bytes: 47505,
    authors: ["Charles Esquiaqui", "Vincent Bermel"],
    licence: "GNU LGPL, version 3 or later",
    note: "Neoclassical with the four suits in four colours, which is the same accommodation our own Four colour deck makes, on somebody else's art.",
  }),
  aisleriot({
    id: "anglo",
    name: "Anglo",
    grid: {
      x: 0.7,
      y: 0.7,
      w: 201.1,
      h: 313.6,
      dx: 202.5,
      dy: 315,
      rows: SHEET_ROWS,
    },
    back: { x: 405.6, y: 1260.7, w: 201.1, h: 313.6 },
    paper: "#ffffff",
    bytes: 70416,
    authors: ["Aike Reyer", "Vincent Bermel"],
    licence: "GNU GPL, version 3 or later",
    note: "The English pattern — the deck in everybody's drawer — at bridge proportions, so it is stretched about ten per cent to fit a poker card.",
  }),
  aisleriot({
    id: "anglo-poker",
    name: "Anglo Poker",
    grid: {
      x: -119,
      y: -167.2,
      w: 239,
      h: 335,
      dx: 241,
      dy: 337,
      rows: SHEET_ROWS,
    },
    back: { x: 363, y: 1180.8, w: 239, h: 335 },
    paper: "#ffffff",
    bytes: 98569,
    authors: ["Vincent Bermel", "Adrian Kennard"],
    licence: "GNU LGPL, version 3 or later",
    note: "The English pattern again, drawn at poker proportions and after an 1860s Goodall design. If you want the deck you grew up with, this is it.",
  }),
  aisleriot({
    id: "atlasnye",
    name: "Atlasnye",
    grid: {
      x: 0.215,
      y: 0.4,
      w: 94.437,
      h: 142.056,
      dx: 95.237,
      dy: 142.856,
      rows: SHEET_ROWS,
    },
    back: { x: 190.677, y: 571.53, w: 94.447, h: 142.64 },
    paper: "#ffffff",
    bytes: 128885,
    authors: ["Vincent Bermel"],
    licence: "GNU LGPL, version 3 or later",
    note: 'The Russian "Satin" deck, after Dmitry Fomin\'s CC0 drawing of it — which is 636KB on Wikimedia and 126KB here, because this is the version somebody optimised.',
  }),
  aisleriot({
    id: "paris",
    name: "Paris",
    grid: {
      x: 0.41,
      y: 0.395,
      w: 93.392,
      h: 132.02,
      dx: 94.19,
      dy: 132.82,
      rows: SHEET_ROWS,
    },
    back: { x: 188.78, y: 531.685, w: 93.392, h: 132.02 },
    paper: "#ffffff",
    bytes: 150662,
    authors: ["David Bellot", "Tony 52", "Vincent Bermel"],
    licence: "GNU LGPL, version 2.1 or later",
    note: "The Ancient French pattern, by the author of the French deck. It indexes in French — 1, V, D, R rather than A, J, Q, K — which is authentic and is worth knowing before you choose it.",
  }),
  aisleriot({
    id: "guyenne",
    name: "Guyenne Classic",
    grid: {
      x: 0.75,
      y: 0.75,
      w: 77.5,
      h: 121.5,
      dx: 79,
      dy: 123,
      rows: SHEET_ROWS,
    },
    back: { x: 158.75, y: 492.75, w: 77.5, h: 121.5 },
    paper: "#ffffff",
    bytes: 190614,
    authors: ["Richard Hoelscher", "Mario Frasca"],
    licence: "GNU GPL, version 3 or later",
    note: "Traced from an 18th-century woodblock, in flat unshaded colour. The loudest deck here and the only one that looks printed rather than drawn.",
  }),
  {
    id: "french",
    name: "French",
    sprite: "/decks/french/deck.svg",
    /*
     * **Not the sprite's own viewBox**, which is what shipped first: the
     * declared 169.075 × 244.640 carries 8 units of empty margin, so every
     * card came out small and high inside its element.
     *
     * What replaced it cropped too far the other way. It cut to the *inside*
     * of the deck's printed border — x 2.5 to 166.575, y 2.5 to 235.27 — on
     * the reasoning that the border was a second card drawn over ours. The
     * card is 242.14 units tall, so that dropped 8 units off the bottom, and
     * what lives in the bottom 8 units of a Bellot card is the rotated index.
     * Both corner indices and all four edges of the border came off, at every
     * size, on every table.
     *
     * The box below is the card itself, measured: `#back` reports
     * 1.25 1.25 166.575 242.14 and every one of the 52 faces reports the same
     * rectangle. The deck's border, corners and paper are drawn because the
     * deck drew them.
     *
     * 166.575 × 242.14 is 1 : 1.454, and the board is laid out at 1.454 while
     * this deck is in hand — see {@link deckAspect}.
     *
     * The steps are zero because this sheet draws all 52 cards in the same
     * place, the one deck here that is not a contact sheet.
     */
    grid: {
      x: 1.25,
      y: 1.25,
      w: 166.575,
      h: 242.14,
      dx: 0,
      dy: 0,
      rows: [0, 0, 0, 0],
    },
    /** Its own back, which is drawn on exactly the rectangle its faces are. */
    back: { x: 1.25, y: 1.25, w: 166.575, h: 242.14 },
    paper: "#ffffff",
    bytes: 332897,
    symbol: bellotSymbol,
    credit: {
      name: "French (SVG-cards 4.0.2)",
      authors: ["David Bellot", "Huub de Beer"],
      licence: "GNU LGPL, version 2.1 or later",
      source: "https://svg-cards.sourceforge.net/",
      licenceUrl: "/decks/french/LICENSE.txt",
      note: "The GNOME and Aisleriot deck, used unmodified. The heaviest deck here by a distance, and the one this site shipped first.",
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
    note: "Gradients, recoloured by whichever table is on. They are what the decks we draw are printed on, and what a sourced deck falls back to before its own back has arrived.",
  },
];
