# solitaire

A solitaire website. Live at
[solitaire.martinsundal.no](https://solitaire.martinsundal.no/).

> **Status: playable, it feels like cards, it celebrates, and it remembers.**
> [Milestones 0 to 5](docs/09-roadmap.md) are built —
> [`src/engine/`](src/engine/) is the complete Klondike rules as a pure
> TypeScript library, and [`src/game/`](src/game/) is a board you can deal,
> drag, tap and win on a phone. The cards are dealt out of the stock a row at a
> time, turn over with a real flip, settle with a small overshoot, shake when
> they have nowhere to go, open a column out under a long press, and make a
> noise doing it. Winning runs the full [cascade](docs/06-win-sequence.md):
> fifty-two cards thrown off the foundations under real physics, with canvas
> trails and a note per bounce. Add `?win` to the URL to watch it without
> winning first.
>
> Three tables, four decks and three card backs, all switchable and all
> [contrast-checked](docs/08-accessibility.md). New deals come out of a pool of
> 10,000 per draw mode that a [build-time solver](docs/03-engine.md) has
> actually won, there is a daily deal with a streak nobody will ever nag you
> about, and the game, your settings, your stats and your best on each deal
> survive closing the tab. Hint points at a move; Finish plays out a deal that
> is already won. What is left is [milestone 6](docs/09-roadmap.md): the
> desktop layout, the keyboard model and the screen-reader work.

## Design

The product is designed before it is built. [`docs/`](docs/README.md) holds the
brief, the Klondike rules as implemented, the engine and architecture specs, the
art direction, the interaction and motion language, the
[win sequence](docs/06-win-sequence.md), accessibility and the roadmap.

Start with the [product brief](docs/01-product-brief.md).

## Stack

Astro 6, static output. pnpm, TypeScript strict, Prettier,
Playwright, [mise](https://mise.jdx.dev/) for the toolchain — the same setup as
[StudyCompanion](https://github.com/MartinSA04/StudyCompanion) and
[martinsundal.no](https://github.com/MartinSA04/martinsundal.no).

The game is a single Svelte island on an otherwise static page, with the card
layer held outside reactivity — the reasoning is in
[docs/07](docs/07-architecture.md).

## Getting started

Open the folder in the dev container (**Dev Containers: Reopen in Container**)
and everything below already works — `.devcontainer/post-create.sh` provisions
the mise toolchain, installs dependencies and fetches Chromium.

Outside the container:

```sh
mise install && pnpm install
```

## Commands

```sh
pnpm dev           # astro dev on :4321
pnpm build         # static build to dist/
pnpm preview       # serve the built site
mise run check     # test + typecheck + lint, in CI's order
pnpm test          # node --test over test/**/*.test.ts
pnpm test:e2e      # Playwright, against a real build via astro preview
pnpm lint:fix      # prettier --write
pnpm lint:md       # markdownlint over the docs
```

## Workflows

- `ci.yml` — test + typecheck + lint + markdownlint + a build smoke, plus the
  Playwright suite, on every branch push and fork PR.
- `deploy.yml` — push to `main` builds and deploys to GitHub Pages. It re-runs
  the cheap checks first, because Actions has no cross-workflow `needs` and
  without them a red `main` would still ship.

## Deploying

Fully static, so there are no secrets and nothing to configure per deploy. Two
one-time steps:

1. **Repo → Settings → Pages → Source: "GitHub Actions"**.
2. A `CNAME` record for `solitaire` → `martinsa04.github.io` in the
   `martinsundal.no` Cloudflare zone, **DNS-only (grey cloud)** so GitHub can
   issue the certificate. Proxying it breaks the ACME challenge.

The custom domain itself comes from [`public/CNAME`](public/CNAME), which the
build copies verbatim into `dist/` — so it survives every deploy without being
re-entered in the repo settings. That host is also `site` in `astro.config.mjs`
and the `Sitemap:` line in `public/robots.txt`; `test/site.test.ts` asserts all
three still agree.

## License

MIT — see [LICENSE](LICENSE).
