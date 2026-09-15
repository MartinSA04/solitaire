# solitaire

A solitaire website. Live at
[solitaire.martinsundal.no](https://solitaire.martinsundal.no/).

> **Status: scaffolding.** Toolchain, dev container, CI and deploy are in place.
> There is no game yet.

## Stack

Astro 6, static output, no UI framework. pnpm, TypeScript strict, Prettier,
Playwright, [mise](https://mise.jdx.dev/) for the toolchain — the same setup as
[StudyCompanion](https://github.com/MartinSA04/StudyCompanion) and
[martinsundal.no](https://github.com/MartinSA04/martinsundal.no).

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
