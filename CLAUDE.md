# solitaire

A solitaire website. Astro 6 static site, pnpm, deployed to GitHub Pages at
<https://solitaire.martinsundal.no>.

The engine, a playable board, the win sequence, the motion catalogue and the
themes and decks are built (milestones 0 to 4 of `docs/09-roadmap.md`); the
parts of their bars that need hardware or people are noted there. Everything is
designed in `docs/` before it is written; a change that contradicts a doc
changes the doc in the same commit.

## Invariants

- **The canonical host is named in three files** — `astro.config.mjs`,
  `public/CNAME`, `public/robots.txt`. `test/site.test.ts` is what notices when
  they stop agreeing; nothing at build time does.
- **Unit tests are `test/**/*.test.ts`; Playwright specs are `e2e/**/*.pw.ts`.**
  Different suffixes so neither runner picks up the other's files.
- **`mise.toml`'s pnpm pin and `package.json`'s `packageManager` must match**,
  or a container install and a CI install resolve different trees.
- **The deal number → deal mapping is frozen forever.** `src/engine/rng.ts` and
  `src/engine/deal.ts` may be rewritten but never made to behave differently;
  `test/engine/rng.test.ts` and `test/engine/deal.test.ts` pin them. Deal
  numbers are shared between players, a saved game is a seed plus a move list,
  and bests are keyed by seed — a changed shuffle silently invalidates all
  three. A different generator ships as a *named second* one.
- **`src/engine/` is pure**: it imports nothing outside itself and touches no
  browser API, `Math.random` or `Date`. `test/engine/purity.test.ts` reads the
  source to enforce it.
- **The card layer is not reactive.** Svelte renders the 52 card elements once
  per deal, inside `{#key gameId}`, and never touches them again;
  `src/game/CardLayer.ts` writes `transform` and `z-index` directly. Svelte
  state may call into it, never re-render it. A move is a changed transform —
  no reparenting, no FLIP, no measuring. See `docs/07-architecture.md`.
- **`src/game/Layout.ts` is the only source of board geometry**, and it is
  pure: an area in, numbers out. It writes its measurements onto `.board` as
  custom properties and the CSS consumes them, so the slot grid and the card
  transforms cannot drift apart. CSS works nothing out for itself except a
  pre-hydration estimate. `test/game/layout.test.ts` pins the numbers.
- **Only `transform` and `opacity` animate on a card**, and `will-change` goes
  on only for as long as something is moving — the length of a move, or of the
  win sequence's stages 1 to 3. Permanent `will-change` on 52 elements costs
  real memory on a cheap GPU.
- **A look is three attributes on `<html>`** — `data-theme`, `data-deck`,
  `data-back` — and `src/game/settings.ts` is the only thing that writes them.
  A theme or deck is a set of custom properties and nothing else; the stylesheets
  in `src/themes/` and `src/decks/` hang off those attributes and know nothing
  about each other. **Deck files are imported after theme files**, and that
  order is what decides a conflict between them, because the two selectors have
  equal specificity. `test/themes/` asserts the token contract from `docs/04`
  and the contrast table from `docs/08` by reading the stylesheets.
- **A sourced deck is fetched, then injected into the document.** Cross-file
  `<use href="deck.svg#id">` is unsupported in Safari. `src/game/DeckArt.ts`
  fetches the sprite once and `CardLayer.setArt()` points the 52 `<use>`
  elements at it — never Svelte, and never on a first load. Every failure path
  leaves the typographic deck on screen. A deck in `src/decks/sourced.ts` ships
  its licence at `public/decks/<id>/LICENSE.txt` and is credited on `/credits`
  automatically; `test/decks/sourced.test.ts` refuses one that doesn't.
- **`e2e/visual.pw.ts-snapshots/` is committed expected output**, not an
  artifact. A change to it is a change to how the product looks and gets looked
  at before it is committed.
- **The win sequence owns the card layer once it starts.** `CardLayer.surrender()`
  hands the 52 elements to `WinSequence.ts`'s physics loop and makes `render()`
  a no-op, so a resize mid-cascade cannot put the cards back on their
  foundations. `?win` runs the whole thing without winning and `?winseed=N`
  makes it deterministic; see `docs/06-win-sequence.md`.

## Commands

```sh
pnpm dev           # astro dev on :4321
pnpm build         # static build to dist/
mise run check     # test + typecheck + lint, in CI's order
pnpm test          # node --test
pnpm test:e2e      # Playwright against a real build
pnpm lint:fix      # prettier --write
```
