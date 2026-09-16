import { DECKS, type Deck } from "../game/settings.ts";
import { type SourcedDeck, sourcedDeck } from "./sourced.ts";

/**
 * Every deck there is, in the order they are offered in, with the one line
 * each that the gallery shows.
 *
 * Two lists meet here and neither is the whole story on its own: `DECKS` in
 * settings.ts says which ids exist and is the thing storage is validated
 * against, and `SOURCED` says everything about the ones we did not draw. What
 * is left over is the five we *did* draw, which have no registry entry because
 * they have no sprite, no licence and nothing to download — a deck we draw is
 * a handful of custom properties in src/decks/*.css and that is all of it.
 *
 * {@link CATALOGUE} is built from `DECKS` rather than assembled by hand, and
 * {@link BLURBS} is a total `Record<Deck, string>`, so a deck added to the list
 * and forgotten here is a type error rather than a blank tile.
 */

export interface DeckEntry {
  id: Deck;
  name: string;
  /** One line, in the gallery, under the name. */
  blurb: string;
  /**
   * What choosing it costs over the network, or `null` for a deck we draw —
   * which is not "0 KB", it is "there is nothing to fetch". The gallery says
   * so in those words.
   */
  bytes: number | null;
  /** The registry entry, for the decks that have one. */
  sourced: SourcedDeck | null;
}

/**
 * The decks we draw, which are the ids `SOURCED` has nothing to say about:
 * they are not sourced from anywhere, so they have no registry entry to take a
 * name from. /credits describes them separately and at more length, in `OURS`.
 */
const NAMES: Partial<Record<Deck, string>> = {
  minimal: "Minimal",
  classic: "Classic",
  vintage: "Vintage",
  "high-contrast": "High contrast",
  "four-colour": "Four colour",
};

/**
 * The gallery's line for each deck. For a sourced deck it is a shortening of
 * the credit note in `SOURCED` — the credits page has room to say where a deck
 * came from and who drew it, and a tile has room for what it looks like.
 */
const BLURBS: Record<Deck, string> = {
  minimal:
    "Rank and suit in the table's own type. The default, and the most legible at a small card.",
  classic: "Minimal set in a book serif, in a printed card's crimson.",
  vintage:
    "A sepia serif on aged board. It brings its own paper to every table.",
  "high-contrast": "Black on white, oversized, at maximum weight.",
  "four-colour": "♠ black, ♥ red, ♦ blue, ♣ green.",
  minium: "A jumbo index and one pip. No court cards at all.",
  "minium-dark": "The same, printed on a dark card.",
  simplistic: "Indices only, twice per card.",
  "tango-nuevo": "Flat modern courts on a warm white card.",
  "pixelangelo-compact": "A traditional deck, at its best on a phone.",
  pixelangelo: "The court cards from nineties desktop solitaire.",
  ornamental: "Storybook courts on ivory board.",
  plastic: "Modern illustrated courts in red, black and gold.",
  neoclassical: "Flat, high-contrast courts drawn as shapes.",
  "neoclassical-four-colour": "Neoclassical, with a colour for each suit.",
  anglo: "The English pattern — the deck in the drawer.",
  "anglo-poker": "The English pattern, at poker proportions.",
  atlasnye: 'The Russian "Satin" deck.',
  paris: "The Ancient French pattern. It indexes 1, V, D, R.",
  guyenne: "Traced from an 18th-century woodblock.",
  french: "The GNOME and Aisleriot deck. The heaviest here.",
};

export const CATALOGUE: readonly DeckEntry[] = DECKS.map((id) => {
  const sourced = sourcedDeck(id) ?? null;
  return {
    id,
    // A sourced deck names itself in the registry, beside its licence, which
    // is the one place that name can be checked against what it is credited
    // as. Ours are named above.
    name: sourced?.name ?? NAMES[id] ?? id,
    blurb: BLURBS[id],
    bytes: sourced?.bytes ?? null,
    sourced,
  };
});

export function deckEntry(id: Deck): DeckEntry {
  return CATALOGUE.find((entry) => entry.id === id) as DeckEntry;
}

/**
 * "126 KB", or nothing at all.
 *
 * Rounded to whole kilobytes above 10KB and one decimal below, because the
 * difference between 3.5KB and 5.4KB is interesting at that end and the
 * difference between 126KB and 127KB is not. What a player is deciding with
 * this number is whether to wait, so it is the number over the wire.
 */
export function wireSize(bytes: number): string {
  const kb = bytes / 1024;
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
}
