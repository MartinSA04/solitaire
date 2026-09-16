# solitaire

A solitaire website. Astro 6 static site, pnpm, deployed to GitHub Pages at
<https://solitaire.martinsundal.no>.

The engine and a playable board are built (milestones 0 and 1 of
`docs/09-roadmap.md`). Everything is designed in `docs/` before it is written;
a change that contradicts a doc changes the doc in the same commit.

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
  on only for the length of a move.

## Commands

```sh
pnpm dev           # astro dev on :4321
pnpm build         # static build to dist/
mise run check     # test + typecheck + lint, in CI's order
pnpm test          # node --test
pnpm test:e2e      # Playwright against a real build
pnpm lint:fix      # prettier --write
```
