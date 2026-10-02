# solitaire

Klondike solitaire in the browser, at
[solitaire.martinsundal.no](https://solitaire.martinsundal.no/).

Built with Astro and one Svelte island. Design notes are in
[docs/notes.md](docs/notes.md).

```sh
mise install && pnpm install
pnpm dev           # astro dev on :4321
pnpm build         # static build to dist/
mise run check     # test + typecheck + lint
pnpm test:e2e      # Playwright against a real build
```

Pushing to `main` deploys to GitHub Pages.

MIT — see [LICENSE](LICENSE).
