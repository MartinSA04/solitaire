<script lang="ts">
  import { CATALOGUE, wireSize } from "../../decks/catalogue.ts";
  import { deckDownloaded } from "../DeckArt.ts";
  import { AUTO, type Deck, type Settings, resolve } from "../settings.ts";
  import Sheet from "./Sheet.svelte";

  interface Props {
    settings: Settings;
    /** The deck whose sprite is in the air, if one is. */
    pending: string | null;
    /** The deck whose sprite did not arrive. */
    failed: string | null;
    onChange: (settings: Settings) => void;
    onClose: () => void;
  }

  const { settings, pending, failed, onChange, onClose }: Props = $props();

  /**
   * Every deck there is, to look at before choosing.
   *
   * **It is a library, not a shop.** Nothing here is locked, earned, bought or
   * timed: docs/01-product-brief.md rules all four out and this is the surface
   * where a product usually breaks that promise. The only thing that differs
   * between one deck and another is how many bytes it takes to put it on the
   * table, so that is the only thing a tile says beyond what the deck looks
   * like — and the five we draw say "No download", which is not "0 KB" but
   * "there is nothing to fetch".
   *
   * It is its own sheet because twenty-one decks with pictures is not a row of
   * chips in a settings list. The menu keeps one line — the deck you are on,
   * and a way in here.
   *
   * The controls are real radios, as everywhere else in the chrome: they carry
   * the checked state, the label and the arrow-key model for nothing, and a
   * grid of `aria-pressed` divs would be an imitation that reads worse in
   * every screen reader.
   */

  let onDevice = $state<Set<string>>(new Set());

  /**
   * Which sprites are already on this device. Asked of the cache, not of us.
   *
   * `pending` and `failed` are read rather than used, and that read is the
   * whole point: they are the only two things that change what the cache
   * holds while this sheet is open, so touching them here is what re-runs the
   * effect when a download settles. Without it the answer was taken once at
   * mount, and a deck you had just watched arrive went on saying nothing until
   * you closed the gallery and opened it again.
   */
  $effect(() => {
    void pending;
    void failed;
    let live = true;
    void (async () => {
      const found = new Set<string>();
      for (const entry of CATALOGUE) {
        if (entry.sourced !== null && (await deckDownloaded(entry.sourced))) {
          found.add(entry.id);
        }
      }
      if (live) onDevice = found;
    })();
    return () => {
      live = false;
    };
  });

  /** What the table would choose, for the tile that hands the choice back. */
  const auto = $derived(resolve({ ...settings, deck: AUTO }).deck);

  function choose(deck: Deck | typeof AUTO): void {
    onChange({ ...settings, deck });
  }

  /** The back a deck is printed on, for the swatches we draw ourselves. */
  function backOf(deck: Deck): string {
    return resolve({ ...settings, deck }).back;
  }

  /**
   * What the tile says under the name. One line, and it changes only while
   * something is actually happening: a deck that is coming says so, and a deck
   * that did not arrive says that instead of failing silently — this is the
   * one place in the product where a failed fetch is worth a word, because it
   * is the one place somebody asked for a file and can see it did not come.
   *
   * Not called `state`. A local binding of that name shadows the `$state`
   * rune, so `$state(...)` above compiles to a store subscription on *this
   * function* and the component dies at mount with "`state` is not a store".
   */
  function status(id: string, bytes: number | null): string {
    if (bytes === null) return "No download";
    if (pending === id) return "Downloading…";
    if (failed === id) return "Didn't download — still on the last deck";
    return onDevice.has(id)
      ? `${wireSize(bytes)} · on this device`
      : wireSize(bytes);
  }
</script>

<Sheet title="Decks" {onClose}>
  <p class="sheet-note">
    Every deck is here from the start. The ones we did not draw are somebody
    else's artwork and download when you pick one; the size on a tile is what
    that download costs, and a deck you have used before is already on this
    device.
  </p>

  <div class="deck-grid" role="radiogroup" aria-label="Deck">
    <label class="deck-tile">
      <input
        type="radio"
        name="deck"
        value={AUTO}
        checked={settings.deck === AUTO}
        onchange={() => choose(AUTO)}
      />
      <span class="deck-shot" data-deck={auto} data-back={backOf(auto)}>
        <span class="swatch-card swatch-face"
          ><span class="swatch-index">K<span>♠</span></span></span
        >
        <span class="swatch-card swatch-face is-red"
          ><span class="swatch-index">7<span>♦</span></span></span
        >
        <span class="swatch-card swatch-back"></span>
      </span>
      <span class="deck-name">Match the table</span>
      <span class="deck-blurb">Whichever deck the table brings with it.</span>
      <span class="deck-state">No download</span>
    </label>

    {#each CATALOGUE as entry (entry.id)}
      <label class="deck-tile">
        <input
          type="radio"
          name="deck"
          value={entry.id}
          checked={settings.deck === entry.id}
          onchange={() => choose(entry.id)}
        />
        {#if entry.sourced === null}
          <!--
            A deck we draw has no picture to show, because it is not a picture:
            it is a handful of custom properties, and it looks different on
            each of the three tables. So the swatch *is* the deck — the same
            tokens the card layer reads, on a card a twentieth of the size —
            and it restyles with the table exactly as the real thing does.
          -->
          <span
            class="deck-shot"
            data-deck={entry.id}
            data-back={backOf(entry.id)}
          >
            <span class="swatch-card swatch-face"
              ><span class="swatch-index">K<span>♠</span></span></span
            >
            <span class="swatch-card swatch-face is-red"
              ><span class="swatch-index">7<span>♦</span></span></span
            >
            <span class="swatch-card swatch-back"></span>
          </span>
        {:else}
          <!--
            Rendered from the deck's own sprite by scripts/deck-previews.ts and
            committed: three or four kilobytes against a deck's three to a
            hundred and ninety, lazily, and only for the tiles you scroll to.
            `alt` is empty because the name is right underneath it.
          -->
          <img
            class="deck-shot"
            src={`/decks/${entry.id}/preview.webp`}
            width="231"
            height="152"
            loading="lazy"
            decoding="async"
            alt=""
          />
        {/if}
        <span class="deck-name">{entry.name}</span>
        <span class="deck-blurb">{entry.blurb}</span>
        <span class="deck-state">{status(entry.id, entry.bytes)}</span>
      </label>
    {/each}
  </div>

  <!--
    The index overlay. It lives here rather than in the menu because it is a
    fact about the deck you are looking at, and it is the answer to the one
    thing docs/04 requires of a deck and some of these do not give: a rank you
    can read in a fanned column at a 46px card.
  -->
  <label class="switch">
    <input
      type="checkbox"
      checked={settings.cardIndex}
      onchange={(event) =>
        onChange({ ...settings, cardIndex: event.currentTarget.checked })}
    />
    <span class="track" aria-hidden="true"></span>
    <span class="switch-label">
      Large index over the art
      <span class="switch-note">
        Draws our own rank and suit in the corner of a deck we did not draw, for
        the ones whose own index is small. It does nothing to the decks above
        that have no artwork.
      </span>
    </span>
  </label>

  <p class="sheet-note">
    Every deck's source and licence is on the <a href="/credits/"
      >credits page</a
    >.
  </p>
</Sheet>

<style>
  .sheet-note {
    margin: 0 0 16px;
    color: color-mix(in srgb, var(--chrome-fg) 72%, transparent);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  /*
   * Two columns on a phone and as many as fit past that. A tile is the whole
   * control — the input inside it is moved out of the way visually and keeps
   * the checked state, the label and the focus ring, which comes back on the
   * tile.
   */
  .deck-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
  }

  .deck-tile {
    container-type: inline-size;
    position: relative;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 2px;
    padding: 8px 10px 10px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--chrome-fg) 8%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--chrome-fg) 14%, transparent);
    cursor: pointer;
  }

  .deck-tile input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  /* Lightness and a border, never hue alone — docs/08-accessibility.md. */
  .deck-tile:has(input:checked) {
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .deck-tile:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .deck-shot {
    display: block;
    width: 100%;
    height: auto;
    margin-bottom: 6px;
    border-radius: 6px;
    object-fit: contain;
  }

  .deck-name {
    font-weight: 600;
    font-size: 0.92rem;
  }

  .deck-blurb {
    color: color-mix(in srgb, currentcolor 74%, transparent);
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .deck-state {
    margin-top: 4px;
    color: color-mix(in srgb, currentcolor 66%, transparent);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  /*
   * The swatch for a deck we draw: three little cards wearing that deck's own
   * tokens. `data-deck` and `data-back` are the same attributes `<html>`
   * carries, so the stylesheets in src/decks match here as well and a swatch
   * is the deck rather than a picture of it.
   */
  /*
   * The same three cards, in the same proportions and at the same fan as the
   * rendered previews beside them — 72 wide and 41 apart in a box 154 across,
   * from scripts/deck-previews.ts. Everything is a percentage so a swatch is
   * the size of its tile, exactly as an image is.
   */
  span.deck-shot {
    position: relative;
    aspect-ratio: 154 / 101;
    background: none;
    /*
     * The container the swatch measures itself against, so `cqw` below is the
     * width of the picture rather than of the tile around it — which is what
     * lets the index be sized off the card the way the card layer sizes it off
     * `--card-w`.
     */
    container-type: inline-size;
  }

  .swatch-card {
    position: absolute;
    top: 0;
    width: 46.75%;
    height: 100%;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgb(0 0 0 / 35%);
  }

  .swatch-face {
    background: var(--card-bg);
    color: var(--suit-spades);
  }

  .swatch-face.is-red {
    color: var(--suit-diamonds);
  }

  .swatch-card:nth-child(1) {
    left: 0;
  }
  .swatch-card:nth-child(2) {
    left: 26.6%;
  }
  .swatch-card:nth-child(3) {
    left: 53.2%;
  }

  .swatch-back {
    background-color: var(--back-bg);
    background-image: var(--back-pattern);
    background-size: var(--back-pattern-size, auto);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 35%),
      inset 0 0 0 1px var(--back-edge);
  }

  /*
   * The index, in the corner, exactly where `.card-index` puts it on the board
   * — same 3% and 7% offsets, same baseline, same rank-then-suit order.
   *
   * It used to be centred in the card, which put it under the card fanned over
   * the top of it: every swatch in the gallery showed half a K and half a 7.
   * A card's index is in its corner because that is the part of it a fan
   * leaves showing, and a swatch of a fan needs it there for the same reason.
   *
   * Sized against the swatch rather than in pixels, so a tile that grows on a
   * wide screen grows the index with it — the same way the card layer scales
   * everything on the board off the card's own width. A swatch card is 46.75%
   * of the picture, so 46.75cqw is this deck's `--card-w`.
   */
  .swatch-index {
    position: absolute;
    top: 3%;
    left: 7%;
    display: flex;
    align-items: baseline;
    gap: 0.1em;
    font-family: var(--index-font);
    font-weight: var(--index-weight, 600);
    /*
     * A swatch card is 46.75% of the picture, so 46.75cqw is this deck's
     * `--card-w`. The cap is what the strip left by the card fanned over the
     * top will hold: High contrast sets `--index-size: 0.44` and prints its
     * suit at 0.95 of the rank, which on the board is the whole point of that
     * deck and in a three-card fan ran a sliced ♠ under the next card.
     */
    font-size: calc(46.75cqw * min(var(--index-size, 0.36), 0.33));
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .swatch-index span {
    font-size: calc(1em * var(--index-suit-scale, 0.8));
  }

  .switch {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 44px;
    margin-bottom: 16px;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  /* The same switch the menu uses, to the pixel: see SettingsSheet.svelte. */
  .track {
    position: relative;
    flex: 0 0 auto;
    width: 44px;
    height: 26px;
    margin-top: 2px;
    border-radius: 13px;
    background: color-mix(in srgb, var(--chrome-fg) 12%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--chrome-fg) 20%, transparent);
  }

  .track::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--chrome-fg-dim);
    transition: translate var(--t-instant) var(--e-out);
  }

  .switch:has(input:checked) .track {
    background: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .switch:has(input:checked) .track::after {
    background: var(--accent-contrast);
    translate: 18px 0;
  }

  .switch:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 8px;
  }

  .switch-label {
    font-size: 0.92rem;
  }

  .switch-note {
    display: block;
    margin-top: 2px;
    color: color-mix(in srgb, var(--chrome-fg) 70%, transparent);
    font-size: 0.78rem;
    line-height: 1.4;
  }
</style>
