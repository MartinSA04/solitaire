// @ts-check
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";

export default defineConfig({
  // The canonical origin. Named in THREE places that must agree — here,
  // public/CNAME (what GitHub Pages serves the site as) and public/robots.txt's
  // `Sitemap:` line. test/site.test.ts asserts they still do; a mismatch is
  // invisible in dev and only shows up as a wrong canonical URL in production.
  site: "https://solitaire.martinsundal.no",
  output: "static",
  trailingSlash: "always",
  build: {
    // The game's CSS is large-ish and shared by every route, so it is worth one
    // cacheable request rather than being inlined into each document. Astro's
    // default ("auto") would inline it per page.
    inlineStylesheets: "never",
  },
  // Emits /sitemap-index.xml, which public/robots.txt points crawlers at.
  // Svelte backs the single game island — see docs/07-architecture.md for why
  // there is a framework at all, and where its boundary is.
  integrations: [sitemap(), svelte()],
  vite: {
    build: {
      cssCodeSplit: true,
      // The winnable-deal pools are 40KB each and must stay *files*. Vite
      // inlines a small enough asset as a base64 data URL, which would put a
      // third of a megabyte of deal numbers inside the island's JS — the one
      // thing the budget in docs/07-architecture.md cannot afford, for a
      // fetch that is deliberately not on the critical path.
      assetsInlineLimit: (file) => (file.endsWith(".bin") ? false : undefined),
    },
  },
});
