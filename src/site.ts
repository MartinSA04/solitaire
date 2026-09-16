/**
 * Where the site's pageviews go.
 *
 * GoatCounter, one endpoint, named once. It is separate from the canonical
 * host in `astro.config.mjs` on purpose: that host is where the site *is*, and
 * this is a different account on somebody else's server, so the two are free
 * to disagree and `test/site.test.ts` does not try to make them agree.
 *
 * What it collects: the path, the page title, the referrer, the screen size, a
 * country from the IP, and the browser. No cookies, no `localStorage`, and no
 * identifier that survives the day — GoatCounter counts a repeat visit with a
 * salted hash it throws away, which is why there is no consent banner here.
 *
 * `count.js` declines to count `localhost`, so dev servers and the Playwright
 * suite — which runs against a real build on :4321 — cannot report into this.
 */
export const ANALYTICS = "https://solitairemartinsundal.goatcounter.com";
