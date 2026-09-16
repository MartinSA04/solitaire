# solitaire

A solitaire website. Astro 6 static site, pnpm, deployed to GitHub Pages at
<https://solitaire.martinsundal.no>.

The engine, a playable board, the win sequence, the motion catalogue, the themes
and decks, the deals, persistence and statistics, and the keyboard, screen-reader
and desktop work are built (milestones 0 to 6 of `docs/09-roadmap.md`); the parts
of their bars that need hardware or people are noted there. Everything is designed
in `docs/` before it is written; a change that contradicts a doc changes the doc
in the same commit.

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
- **The winnable pools are generated, committed, and append-only.**
  `scripts/generate-winnable.ts` scans deal numbers upward from 0 at a **frozen
  node budget** and keeps the ones its solver wins, so `src/data/winnable-{1,3}.bin`
  are sorted and append-only at the same time — which is what stops the daily
  deal, an index into the frozen first 4,096 entries, moving under a later run.
  A different budget produces a different *file*, not a different pool. Every
  seed's winning line is replayed through `applyMove` before it goes in;
  `--verify` re-runs that over a committed pool and `test/engine/solve.test.ts`
  re-derives a sample. `src/engine/solve.ts` is the one engine module
  `index.ts` does not re-export — a search has no business in a phone's bundle.
- **`localStorage` is untrusted input, and optional.** `src/game/Persist.ts` is
  the only thing that touches it: every read is wrapped and validated field by
  field, every failure falls back to a default *silently*, and a `Persist` with
  no store is a complete object that remembers nothing. A corrupt save is a new
  game, never an error. Keys are `sol:v1:*` and carry `v: 1`; a future `v2`
  reads `v1`, writes `v2`, deletes `v1` — never a silent reinterpretation.
- **A look is three attributes on `<html>`** — `data-theme`, `data-deck`,
  `data-back` — and `src/game/settings.ts` is the only thing that writes them,
  including before the first paint: `BOOTSTRAP` is an inline script generated
  from the same table `resolve()` uses, and `test/game/settings.test.ts` runs it
  against every combination and asserts the two agree.
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
- **Zero axe violations is a gate**, across every surface the chrome can put on
  screen and all three tables — `e2e/axe.pw.ts`. It finds about a third of what
  can be wrong with a page and none of the third that decides whether the game
  is playable, which is why it sits beside a test that wins a whole game by key
  press. A fixture that writes settings must write `v: 1`, or `Persist` ignores
  the record and the island paints the default over whatever the pre-paint
  bootstrap did.
- **The performance bar is measured, not inferred.** `e2e/performance.pw.ts`
  times a cold load over throttled 4G to the first frame of the deal, with and
  without a slow processor, against the brief's two seconds. The gzipped size
  limit beside it is there to bound growth, not to protect that number.
- **The keyboard model and the screen-reader model are one model.** A roving
  focus over the thirteen piles of `PILE_ORDER` — which lives in `Layout.ts`,
  because the board's structure is the board's, and the keyboard, the rendered
  slots and the hit-tester all walk that one list. Moving the focus is how a
  keyboard gets around *and* how a screen reader is told where it is, so there
  is never a second model to keep in step. `src/game/keyboard.ts` is pure — a
  key press and a position in, what the player meant out — which is what lets
  `test/game/keyboard.test.ts` type a whole winning line through it with no
  browser, alongside `e2e/keyboard.pw.ts` doing it again in one. `Tab` never
  enters the card layer: one pile is in the tab order at a time.
- **A pile is a `<button>` whose label is the whole pile**, and it is the only
  thing a screen reader is given — the 52 cards stay `aria-hidden`. Every real
  pointer on the board is hit-tested by `Layout.ts` and played by `Drag`, so
  `activatePile` throws away any click carrying a non-zero `detail`; what is
  left is a screen reader's activate gesture, which is the whole interaction on
  a phone. All of it is written in `src/game/strings.ts` and nowhere else —
  cards and numbers spelled out, because the failure mode of a suit glyph in a
  live region is silence. There are **two polite live regions, written in
  turn**: one cannot say the same thing twice.
- **`Layout.ts` still takes an area and returns numbers** with the card size and
  the page as two more arguments, so the Large board is a unit test rather than
  a browser. It is the only thing that decides how big a card is; the card size
  is not a look and never reaches the three attributes. A page turn is a
  re-measure — which is also the whole of the animation — and the top row never
  moves, because it is where every move ends up.
- **The pageview counter is named once and disclosed once.** `src/site.ts`
  holds the GoatCounter endpoint and `src/layouts/Layout.astro` is the only
  thing that loads it, so every page gets it by going through the one layout —
  a snippet pasted into a page is how one page reports into a different account
  or quietly stops reporting. It is `async` and last in the head, never in
  front of the deal, and `count.js` declines to count `localhost`, so dev and
  the Playwright suite cannot report into the real account. What it collects is
  written out on `/credits`; `test/site.test.ts` holds that page to it. It is
  the site's **only** request to another origin, and the only exception to
  `docs/01-product-brief.md`'s privacy principle.

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
