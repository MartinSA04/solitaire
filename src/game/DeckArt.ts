import type { SourcedDeck } from "../decks/sourced.ts";

/**
 * Fetching a sourced deck's sprite, once, and putting it where `<use>` can
 * reach it.
 *
 * The sprite is **fetched, not bundled**: it stays its own file, byte for byte
 * as its authors published it, which is both what docs/04-art-direction.md's
 * licence policy requires and what keeps 962KB of card art out of a first load
 * that does not want it.
 *
 * It is then injected into the document rather than referenced across files,
 * because `<use href="/decks/french/deck.svg#club_7">` — the obvious way to do
 * this, and the way docs/04 describes — is not supported in Safari, which is
 * most of the phones this game is played on. A same-document `#id` reference
 * works everywhere. Injecting a fetched file into the DOM is not inlining it
 * into the bundle: it is still one cacheable file that arrives over the
 * network, unmodified, when somebody asks for that deck.
 *
 * Every failure is silent and lands in the same place: no art, and the
 * typographic deck underneath is what the player keeps looking at. A deck is a
 * preference, and a preference is not worth an error message.
 */

/** One attempt per deck per page. The result — including failure — is final. */
const attempts = new Map<string, Promise<boolean>>();

export function loadDeckArt(deck: SourcedDeck): Promise<boolean> {
  const started = attempts.get(deck.id);
  if (started !== undefined) return started;
  const attempt = inject(deck).catch(() => false);
  attempts.set(deck.id, attempt);
  return attempt;
}

async function inject(deck: SourcedDeck): Promise<boolean> {
  if (typeof document === "undefined" || typeof fetch === "undefined") {
    return false;
  }
  if (document.querySelector(`[data-sprite="${deck.id}"]`) !== null)
    return true;

  const response = await fetch(deck.sprite);
  if (!response.ok) return false;
  const text = await response.text();

  // `image/svg+xml` rather than `text/html`: an svg parsed as HTML gets its
  // attribute names lowercased, which loses `viewBox` and every `gradientUnits`
  // in the file.
  const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg") return false;

  const host = document.createElement("div");
  host.dataset.sprite = deck.id;
  host.setAttribute("aria-hidden", "true");
  // Hidden, but present: a `<use>` can reach into a subtree that is not
  // displayed, which is the whole idea of a sprite.
  host.style.display = "none";
  host.append(document.importNode(root, true));
  document.body.append(host);
  return true;
}

/** Test seam: there is one document, so there is one cache. */
export function forgetDeckArt(): void {
  attempts.clear();
}
