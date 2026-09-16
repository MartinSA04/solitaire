import type { SourcedDeck } from "../decks/sourced.ts";

/**
 * Fetching a sourced deck's sprite, keeping it, and putting it where `<use>`
 * can reach it.
 *
 * The sprite is **fetched, not bundled**: it stays its own file, byte for byte
 * as its authors published it, which is both what docs/04-art-direction.md's
 * licence policy requires and what keeps somebody else's card art out of a
 * first load that does not want it.
 *
 * It is then injected into the document rather than referenced across files,
 * because `<use href="/decks/french/deck.svg#club_7">` — the obvious way to do
 * this, and the way docs/04 described — is not supported in Safari, which is
 * most of the phones this game is played on. A same-document `#id` reference
 * works everywhere. Injecting a fetched file into the DOM is not inlining it
 * into the bundle: it is still one cacheable file that arrives over the
 * network, unmodified, when somebody asks for that deck.
 *
 * Every failure is silent and lands in the same place: no art, and the
 * typographic deck underneath is what the player keeps looking at. A deck is a
 * preference, and a preference is not worth an error message.
 *
 * ## One sprite at a time
 *
 * `<use href="#club_7">` resolves to the **first** element in the document
 * with that id. Every deck in this family names its cards the same way — that
 * is exactly why the registry is data rather than code — so two sprites in the
 * document at once means every card on the table draws from whichever one was
 * fetched first, silently and for the rest of the session. So there is one
 * attached host, {@link useDeckArt} is what swaps it, and a deck fetched
 * earlier is kept parsed in memory rather than thrown away: going back to it
 * is a re-attach, with no network and no reparse.
 *
 * ## Keeping it
 *
 * A sprite goes into the Cache Storage API under {@link CACHE}, which is what
 * lets the gallery say "downloaded" and mean it: on this device, across
 * reloads, with no connection. It is **not** a service worker and does not
 * become one — nothing is intercepted, there is no lifecycle and no
 * cache-invalidation liability, which is the thing docs/09 deliberately put
 * off. It is a box this module puts files in and takes them out of again.
 *
 * Every call into it is wrapped, and a cache that is missing, full, disabled
 * or throwing falls through to a plain fetch without saying anything —
 * `Persist.ts` treats `localStorage` exactly this way, and for the same
 * reason. The `v1` in the name is there so a future version can be a different
 * box rather than a reinterpretation of this one.
 */

/** Where kept sprites live. Versioned like the `sol:v1:*` storage keys. */
const CACHE = "sol:decks:v1";

/** One attempt per deck per page. The result — including failure — is final. */
const attempts = new Map<string, Promise<HTMLElement | null>>();

/** The one host currently in the document, if any. */
let attached: { id: string; host: HTMLElement } | null = null;

/**
 * Make this deck's sprite the one in the document, fetching it if this is the
 * first time it has been asked for. Resolves to whether the art is now usable.
 */
export function useDeckArt(deck: SourcedDeck): Promise<boolean> {
  const started = attempts.get(deck.id);
  const attempt = started ?? prepare(deck).catch(() => null);
  if (started === undefined) attempts.set(deck.id, attempt);
  return attempt.then((host) => {
    if (host === null) return false;
    attach(deck.id, host);
    return true;
  });
}

/** No sourced deck is on. Take the sprite back out of the document. */
export function clearDeckArt(): void {
  attached?.host.remove();
  attached = null;
}

/**
 * Is this deck already on the device? Asked of the cache rather than of a
 * record we keep, so the answer cannot drift from the truth — a browser that
 * evicted the file says no, which is the right answer.
 */
export async function deckDownloaded(deck: SourcedDeck): Promise<boolean> {
  if (attempts.has(deck.id)) return (await attempts.get(deck.id)) !== null;
  try {
    if (typeof caches === "undefined") return false;
    const cache = await caches.open(CACHE);
    return (await cache.match(deck.sprite)) !== undefined;
  } catch {
    return false;
  }
}

function attach(id: string, host: HTMLElement): void {
  if (attached?.id === id && host.isConnected) return;
  attached?.host.remove();
  document.body.append(host);
  attached = { id, host };
}

async function prepare(deck: SourcedDeck): Promise<HTMLElement | null> {
  if (typeof document === "undefined" || typeof fetch === "undefined") {
    return null;
  }
  const text = await sprite(deck.sprite);
  if (text === null) return null;

  // `image/svg+xml` rather than `text/html`: an svg parsed as HTML gets its
  // attribute names lowercased, which loses `viewBox` and every `gradientUnits`
  // in the file.
  const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg") return null;

  const host = document.createElement("div");
  host.dataset.sprite = deck.id;
  host.setAttribute("aria-hidden", "true");
  /*
   * Out of sight, but **not `display: none`**, which is the obvious way to
   * hide a sprite and is what this did until a deck with a gradient in it
   * arrived.
   *
   * A `<use>` can reach into an undisplayed subtree — that much is true, and
   * it is why this worked for a year with one deck in it. What cannot reach
   * into one is a *paint server*: a `fill="url(#G1734)"` naming a gradient
   * that lives inside `display: none` resolves to nothing, and the shape is
   * painted with whatever is underneath it instead. On the Ornamental deck
   * that is the gold edging its ivory paper is printed over, so all 52 cards
   * came out solid gold — not blank, not broken, just quietly a different
   * deck. Nothing warns about it.
   *
   * Zero-sized and clipped costs nothing to lay out, paints nothing, and
   * leaves every gradient, filter and clip path in the file resolvable.
   */
  host.style.cssText =
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  host.append(document.importNode(root, true));
  return host;
}

/** The bytes, from the cache if they are there and from the network if not. */
async function sprite(url: string): Promise<string | null> {
  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE);
      const kept = await cache.match(url);
      if (kept !== undefined) return await kept.text();
      const response = await fetch(url);
      if (!response.ok) return null;
      // Keeping it is a bonus, never a condition: a full or refusing cache
      // still leaves us holding a perfectly good response.
      try {
        await cache.put(url, response.clone());
      } catch {
        /* no room, no permission, no matter */
      }
      return await response.text();
    }
  } catch {
    /* fall through to the plain fetch below */
  }
  const response = await fetch(url);
  return response.ok ? await response.text() : null;
}

/** Test seam: there is one document, so there is one cache. */
export function forgetDeckArt(): void {
  clearDeckArt();
  attempts.clear();
}
