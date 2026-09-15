# solitaire

A solitaire website. Astro 6 static site, pnpm, deployed to GitHub Pages at
<https://solitaire.martinsundal.no>.

Scaffolding only so far — toolchain, CI and deploy are wired up; there is no
product yet.

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

## Commands

```sh
pnpm dev           # astro dev on :4321
pnpm build         # static build to dist/
mise run check     # test + typecheck + lint, in CI's order
pnpm test          # node --test
pnpm test:e2e      # Playwright against a real build
pnpm lint:fix      # prettier --write
```
