import type { DrawCount } from "../engine/index.ts";

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
 * browser. Storage is milestone 5 — `Persist.ts` will read a `Settings` out of
 * `localStorage` and hand it straight here, which is why nothing below knows
 * where the values came from.
 */

export type Theme = "warm" | "minimal" | "dark";
export type Deck = "minimal" | "high-contrast" | "four-colour";
export type Back = "lattice" | "dots" | "solid";

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
  drawCount: DrawCount;
}

export const DEFAULTS: Settings = Object.freeze({
  theme: "warm",
  deck: AUTO,
  back: AUTO,
  sound: true,
  timer: true,
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
