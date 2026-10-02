# Notes

What the code does not say by itself. The invariants that keep it working are
in [CLAUDE.md](../CLAUDE.md).

## Product

Klondike in a browser, for anyone who wants a quiet game of cards. No accounts,
no ads, nothing locked, earned or bought. No sound. Nothing leaves the device
except one anonymous pageview count, disclosed on `/credits`.

## Rules

- Foundations build up in suit, A to K. Cards may come back off a foundation.
- The tableau builds down in alternating colour. Any face-up run moves as a
  unit. Only a King (or a run headed by one) goes into an empty column. A
  card exposed by a move turns over as part of that move.
- The stock turns one or three cards. In draw-3 only the top of the waste is
  playable. An empty stock recycles the waste in order, with no limit and no
  reshuffle.
- There is no score and no loss: undo and redeals are unlimited, and the
  player decides when a deal is over. Time and moves are recorded.
- **Finish** appears when nothing is face down and the stock and waste are
  empty. The deal is then provably won, and Finish plays every card home
  straight into the win sequence.

## Deals

- A deal number is an unsigned 32-bit seed. The same number is the same deal
  forever: `/?deal=1234&draw=3` shares one. The shuffle is frozen.
- **Winnable only** (on by default) deals from `src/data/winnable-{1,3}.bin`.
  These are seeds a build-time solver has actually won, and the files are
  append-only.
- The daily deal is `hash(YYYY-MM-DD)` into the first 4,096 entries of the
  pool, one per draw mode. It needs no server.

## Architecture

- An Astro static site with one Svelte island (`src/game/Game.svelte`).
- `src/engine/` is the rules as a pure TypeScript library: a seed plus a move
  list, with undo, hints, auto-complete and (separately, in `solve.ts`) a
  solver.
- `src/game/Layout.ts` turns an area into every measurement on the board. It
  is pure and unit-tested. The CSS only consumes the custom properties it
  writes.
- `src/game/CardLayer.ts` owns the 52 card elements. Svelte renders them once
  per deal and never again. A move is a new `transform` with a transition
  armed for its length, so nothing is measured and nothing is reparented.
- `src/game/Drag.ts` handles pointer input with one gesture grammar: tap to
  auto-move, drag to place, long-press to fan a column open. Hit-testing is
  arithmetic against `Layout.ts`, so the cards take no pointer events.
- `src/game/Persist.ts` is the only reader and writer of `localStorage`
  (`sol:v1:*`). Every field is validated, and anything broken falls back to a
  default in silence.

## Look

- A look is three attributes on `<html>`: `data-theme`, `data-deck` and
  `data-back`. They are set before first paint by an inline bootstrap
  generated from `src/game/settings.ts`.
- Themes and decks are sets of custom properties (`src/themes/`,
  `src/decks/`). Deck files load after theme files and win ties.
- Sixteen sourced decks are fetched as SVG sprites on demand and credited on
  `/credits`. Each brings its own aspect ratio and its own back.
- Highlights are lightness and a ring, never hue alone. A legal target rings
  the whole pile. The keyboard focus ring wraps exactly the run Space would
  pick up. A hint rings the card that can move and its destination.

## Motion

- Only `transform` and `opacity` animate on a card. `will-change` is on only
  while something is moving.
- Deal, draw, drop, undo, recycle, peek and the illegal-move shake each have
  their own class and timing in `CardLayer.ts` and `board.css`. Reduced motion
  collapses durations to near zero but keeps a short crossfade for flips.
- **Win sequence** (`WinSequence.ts`): a beat, the foundations pulse, then all
  52 cards are thrown off under real physics with canvas trails, then the
  table clears and a result panel appears. Any tap or key skips it. `?win`
  runs it without winning, and `?winseed=N` makes it deterministic.

## Accessibility

- The thirteen piles are `<button>`s under a roving focus, and the arrow keys
  move between them. Space picks up and puts down, ↑/↓ extend the selection
  up a column, and letter keys run commands (`?` lists them). The keyboard
  model is pure (`keyboard.ts`) and tested by playing a whole game.
- A screen reader reads the pile labels. The 52 cards are `aria-hidden`. Moves
  are announced through two alternating polite live regions, and every string
  is in `strings.ts`.
- Zero axe violations is a gate (`e2e/axe.pw.ts`), and the theme contrast
  ratios are asserted in `test/themes/`.
- A **Large** card size pages the tableau sideways rather than shrinking the
  cards.

## Performance

A cold load over throttled 4G reaches the first frame of the deal in under two
seconds. `e2e/performance.pw.ts` measures this.
