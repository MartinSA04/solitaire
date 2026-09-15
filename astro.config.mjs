// @ts-check
import sitemap from "@astrojs/sitemap";
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
  integrations: [sitemap()],
  vite: {
    build: { cssCodeSplit: true },
  },
});
