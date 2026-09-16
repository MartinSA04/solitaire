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
 * Three we draw as tokens, and one we don't draw at all: "french" is a sprite
 * of somebody else's art, fetched when it is chosen. See src/decks/sourced.ts
 * for what that costs and why it is not a default.
 */
export const DECKS = [
  "minimal",
  "high-contrast",
  "four-colour",
  "french",
] as const;
export const BACKS = ["lattice", "dots", "solid"] as const;

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
  back: Back | Auto;
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
  back: AUTO,
  sound: true,
  timer: true,
  cardSize: "comfortable",
  winnableOnly: true,
  drawCount: 1,
});

/**
 * "theme = surface tokens + light model + type + a default deck", from
 * docs/04-art-direction.md. A table is a taste, and the deck and back that go
 * with it are part of that taste: picking the Minimal table should hand you
 * its flat back rather than leaving the warm one's woven lattice on it.
 *
 * Choosing a deck explicitly replaces this for good — the point of the
 * sourcing policy is that anyone can have any deck on any table.
 */
const TABLE: Record<Theme, { deck: Deck; back: Back }> = {
  warm: { deck: "minimal", back: "lattice" },
  minimal: { deck: "minimal", back: "solid" },
  dark: { deck: "minimal", back: "lattice" },
};

export interface Resolved {
  theme: Theme;
  deck: Deck;
  back: Back;
}

/** What the three attributes should actually say. */
export function resolve(settings: Settings): Resolved {
  const table = TABLE[settings.theme];
  return {
    theme: settings.theme,
    deck: settings.deck === AUTO ? table.deck : settings.deck,
    back: settings.back === AUTO ? table.back : settings.back,
  };
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
var decks=${JSON.stringify(DECKS)};
var backs=${JSON.stringify(BACKS)};
var s={};
try{s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}")||{};}catch(e){}
var theme=table[s.theme]?s.theme:${JSON.stringify(DEFAULTS.theme)};
var d=document.documentElement;
d.dataset.theme=theme;
d.dataset.deck=decks.indexOf(s.deck)<0?table[theme].deck:s.deck;
d.dataset.back=backs.indexOf(s.back)<0?table[theme].back:s.back;
})();`;
