import type { DrawCount } from "../engine/index.ts";
import type { CardSize } from "./Layout.ts";

/**
 * What the player has chosen, and how a choice becomes an attribute.
 *
 * Every look in the product is selected by one attribute on `<html>` —
 * `data-theme`, `data-deck`, `data-back` — and nothing else. The stylesheets
 * in src/themes and src/decks hang off those three; this module is the only
 * code that writes them, and the only place that knows a table has a default
 * deck.
 *
 * It is deliberately pure apart from {@link apply}: the settings are ordinary
 * data, so what a given set of them resolves to is a unit test rather than a
 * browser. `Persist.ts` reads a `Settings` out of `localStorage` and hands it
 * straight here, field by validated field, which is why nothing below knows or
 * cares where the values came from.
 */

/**
 * The values, as data rather than only as types: storage hands us strings and
 * somebody has to say which of them are ours. Persist.ts validates against
 * these lists and so does the bootstrap at the bottom of this file, so there
 * is one place to add a table or a deck.
 */
export const THEMES = ["warm", "minimal", "dark"] as const;
/**
 * Five we draw as tokens, and sixteen we don't draw at all: everything from
 * "minium" down is a sprite of somebody else's art, fetched when it is chosen
 * and never before. See src/decks/sourced.ts for where they came from and what
 * each one costs, and the deck gallery for where a player is told.
 *
 * The order is the order they are offered in: ours first, because ours cost
 * nothing and one of them is the default, then the rest by weight.
 */
export const DECKS = [
  "minimal",
  "classic",
  "vintage",
  "high-contrast",
  "four-colour",
  "minium",
  "minium-dark",
  "simplistic",
  "tango-nuevo",
  "pixelangelo-compact",
  "pixelangelo",
  "ornamental",
  "plastic",
  "neoclassical",
  "neoclassical-four-colour",
  "anglo",
  "anglo-poker",
  "atlasnye",
  "paris",
  "guyenne",
  "french",
] as const;

/**
 * The backs — which are not a choice. See {@link DECK_BACK}.
 *
 * The list stays because `data-back` is still one of the three attributes a
 * look is made of, and something has to say which values are ours.
 */
export const BACKS = [
  "lattice",
  "argyle",
  "pinstripe",
  "ripple",
  "dots",
  "solid",
] as const;

/**
 * Not a look — the three attributes are the whole of a look, and this is
 * geometry. It goes to `Layout.ts`, which is the only thing that decides how
 * big a card is, and nothing about it reaches `<html>`.
 */
export const CARD_SIZES = ["comfortable", "large"] as const;

export type Theme = (typeof THEMES)[number];
export type Deck = (typeof DECKS)[number];
export type Back = (typeof BACKS)[number];

/** A deck or back chosen for you by the table, until you choose one yourself. */
export const AUTO = "auto";
export type Auto = typeof AUTO;

export interface Settings {
  theme: Theme;
  deck: Deck | Auto;
  /** Subtle, and on — the argument for it is in docs/07-architecture.md. */
  sound: boolean;
  /** The clock can be hidden entirely; time is still recorded. docs/02. */
  timer: boolean;
  /**
   * How big the cards are. "Large" shows fewer columns at once and pages the
   * tableau sideways to reach the rest — see {@link CardSize}. The one place
   * the no-scrolling rule bends, and docs/08 says why.
   */
  cardSize: CardSize;
  /**
   * Draw our own corner index on top of a sourced deck's art.
   *
   * Off, and this is the setting that used to be a rule. docs/04 requires a
   * card's rank to be legible at a 46px card, because a fanned column shows
   * about a quarter of each card and that corner is the only part of it
   * anybody reads — and the French deck's own index is about five pixels tall
   * at that size. The answer was to draw ours over every sourced deck's, full
   * stop, which was right while there was one sourced deck and is wrong now
   * there are sixteen: half of them index larger and more clearly than we do,
   * and on Minium dark our patch of the deck's own paper is a black square.
   *
   * So a deck we did not draw is shown as it was drawn, and anyone who finds
   * an engraved deck's index too small turns this on and gets it back — on
   * whichever deck they are actually holding. A deck we *draw* is unaffected:
   * its index is the whole of its face.
   */
  cardIndex: boolean;
  /**
   * Deal only from the pre-verified winnable pool. On by default: a casual
   * player on a bus did not ask to find out that this one was never going to
   * come out. Off deals from the whole 2³² space, which is the honest version
   * of the game and is what some people want. See src/game/pool.ts.
   */
  winnableOnly: boolean;
  drawCount: DrawCount;
}

export const DEFAULTS: Settings = Object.freeze({
  theme: "warm",
  deck: AUTO,
  sound: true,
  timer: true,
  cardSize: "comfortable",
  cardIndex: false,
  winnableOnly: true,
  drawCount: 1,
});

/**
 * "theme = surface tokens + light model + type + a default deck", from
 * docs/04-art-direction.md. A table is a taste, and the deck that goes with it
 * is part of that taste.
 *
 * Choosing a deck explicitly replaces this for good — the point of the
 * sourcing policy is that anyone can have any deck on any table.
 */
const TABLE: Record<Theme, Deck> = {
  warm: "minimal",
  minimal: "minimal",
  dark: "minimal",
};

/**
 * The back a deck is printed on.
 *
 * **A back belongs to the deck, not to the player.** A real deck comes with
 * one; you do not buy a pack of cards and then pick what is on the other side
 * of them. Offering it separately made a fourth of the settings sheet out of a
 * decision nobody has to make, and made it possible to put the flat
 * accessibility back on the French deck's Victorian courts, which is two decks
 * in one pack.
 *
 * So the deck names its back and this is the whole of that naming. It is still
 * `data-back` on `<html>` — the three attributes are unchanged, and
 * `src/decks/backs.css` still knows nothing about which deck is on — because a
 * back is recoloured by the *table*, and keeping it its own attribute is what
 * lets one table's ink reach it without the deck files knowing about themes.
 *
 * What the argument above always implied, and what a deck we did not draw now
 * makes possible, is that a sourced deck is printed on **its own** back: every
 * sprite in src/decks/sourced.ts carries a `back` group beside its 52 cards,
 * and the card layer points at it. That back cannot take `--back-bg` and does
 * not want to — a real pack's back is not repainted by the table it is dealt
 * on. What is named here for those decks is the pattern of ours they wear
 * until their sprite lands, and for good if it never does, which is why this
 * table stays total and stays the thing the pre-paint bootstrap reads.
 */
const DECK_BACK: Record<Deck, Back> = {
  minimal: "lattice",
  classic: "argyle",
  vintage: "pinstripe",
  "high-contrast": "solid",
  "four-colour": "dots",
  // The sourced decks are printed on their own backs — every sprite carries
  // one — so what these name is the back a player sees *before* that arrives,
  // and for good if it never does. They are grouped by what the deck is like
  // rather than each being different, because there are sixteen of them and
  // six patterns, and because none of them is the back you end up looking at.
  minium: "lattice",
  "minium-dark": "solid",
  simplistic: "lattice",
  "tango-nuevo": "argyle",
  "pixelangelo-compact": "ripple",
  pixelangelo: "ripple",
  ornamental: "pinstripe",
  plastic: "argyle",
  neoclassical: "argyle",
  "neoclassical-four-colour": "dots",
  anglo: "ripple",
  "anglo-poker": "ripple",
  atlasnye: "ripple",
  paris: "ripple",
  guyenne: "ripple",
  french: "ripple",
};

export interface Resolved {
  theme: Theme;
  deck: Deck;
  back: Back;
}

/** What the three attributes should actually say. */
export function resolve(settings: Settings): Resolved {
  const deck = settings.deck === AUTO ? TABLE[settings.theme] : settings.deck;
  return { theme: settings.theme, deck, back: DECK_BACK[deck] };
}

/**
 * Write them onto the document element.
 *
 * Instantly, not as the crossfade docs/05 pencilled in against `--t-slow`.
 * Two themes are two sets of custom properties, and CSS cannot interpolate
 * between most of what they hold — a gradient into a flat colour, a shadow
 * into `none`, a 1px hairline into 1.5px. What is possible is fading the
 * table while the cards on it snap, which reads as a glitch rather than as a
 * transition. A clean switch reads as "applied".
 */
export function apply(settings: Settings, root: HTMLElement): void {
  const { theme, deck, back } = resolve(settings);
  root.dataset.theme = theme;
  root.dataset.deck = deck;
  root.dataset.back = back;
}

/** Where {@link Settings} is kept. Persist.ts owns the rest of the schema. */
export const SETTINGS_KEY = "sol:v1:settings";

/**
 * The same three attributes, written before the first paint.
 *
 * Rendered inline in the document head by src/layouts/Layout.astro, so a
 * player who chose the Dark table does not get a frame or two of the Warm one
 * while the island hydrates — on a slow connection that is not a frame, it is
 * a second of the wrong room.
 *
 * It is a string rather than a module because it has to run *before* anything
 * is fetched, and it is here rather than in the template because this file is
 * the only thing allowed to write those attributes. The table of defaults is
 * interpolated from the one above rather than restated, and
 * test/game/settings.test.ts runs this script against every combination of
 * settings and asserts it agrees with {@link apply} — which is what keeps two
 * implementations of one rule from drifting.
 */
export const BOOTSTRAP = `(function(){
var table=${JSON.stringify(TABLE)};
var backs=${JSON.stringify(DECK_BACK)};
var s={};
try{s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}")||{};}catch(e){}
var theme=table[s.theme]?s.theme:${JSON.stringify(DEFAULTS.theme)};
var deck=backs[s.deck]?s.deck:table[theme];
var d=document.documentElement;
d.dataset.theme=theme;
d.dataset.deck=deck;
d.dataset.back=backs[deck];
})();`;
