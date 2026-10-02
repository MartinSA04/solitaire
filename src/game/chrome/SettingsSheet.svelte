<script lang="ts">
  import { deckEntry } from "../../decks/catalogue.ts";
  import {
    AUTO,
    CARD_SIZES,
    THEMES,
    type Settings,
    type Theme,
    resolve,
  } from "../settings.ts";
  import Sheet from "./Sheet.svelte";

  interface Props {
    settings: Settings;
    onChange: (settings: Settings) => void;
    /** The deck gallery, which is its own sheet. */
    onDecks: () => void;
    onClose: () => void;
  }

  const { settings, onChange, onDecks, onClose }: Props = $props();

  /**
   * How the game looks and nothing else: the table, the deck, the card size
   * and the clock. Which game is on the table is the New game sheet's, and
   * nothing in here can end one. Every choice applies on the press.
   *
   * Choices are radio groups on purpose: they come with arrow-key navigation
   * and a group label for free.
   */

  const THEME_LABELS: Record<Theme, string> = {
    warm: "Warm",
    minimal: "Minimal",
    dark: "Dark",
  };

  /** "Match the table" names the deck it resolves to as well. */
  const deckName = $derived(
    settings.deck === AUTO
      ? `Match the table · ${deckEntry(resolve(settings).deck).name}`
      : deckEntry(resolve(settings).deck).name,
  );

  const SIZE_LABELS: Record<(typeof CARD_SIZES)[number], string> = {
    comfortable: "Comfortable",
    large: "Large",
  };

  let sheet: ReturnType<typeof Sheet> | undefined = $state();

  function choose(patch: Partial<Settings>): void {
    onChange({ ...settings, ...patch });
  }
</script>

<Sheet title="Settings" {onClose} bind:this={sheet}>
  <fieldset class="group">
    <legend class="group-label">Table</legend>
    <div class="choices">
      {#each THEMES as value (value)}
        <label class="choice">
          <input
            type="radio"
            name="theme"
            {value}
            checked={settings.theme === value}
            onchange={() => choose({ theme: value })}
          />
          <span class="choice-label">{THEME_LABELS[value]}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <!-- A deck comes printed on its own back, so there is no control for one. -->
  <div class="group">
    <span class="group-label">Cards</span>
    <button
      type="button"
      class="row-button"
      onclick={() => {
        onDecks();
        sheet?.dismiss();
      }}
    >
      <span class="row-label">Deck</span>
      <span class="row-value">{deckName}</span>
    </button>
  </div>

  <!-- "Large" shows fewer columns and pages the tableau sideways on a phone. -->
  <fieldset class="group">
    <legend class="group-label">Card size</legend>
    <div class="choices">
      {#each CARD_SIZES as size (size)}
        <label class="choice">
          <input
            type="radio"
            name="card-size"
            value={size}
            checked={settings.cardSize === size}
            onchange={() => choose({ cardSize: size })}
          />
          <span class="choice-label">{SIZE_LABELS[size]}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <div class="group switches">
    <label class="switch">
      <input
        type="checkbox"
        checked={settings.timer}
        onchange={(event) => choose({ timer: event.currentTarget.checked })}
      />
      <span class="track" aria-hidden="true"></span>
      <span class="choice-label">Show the clock</span>
    </label>
  </div>

  <p class="sheet-foot">
    <a href="/how-to-play/">How to play</a>
    <a href="/credits/">Credits and licences</a>
  </p>
</Sheet>

<style>
  .group {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .group-label {
    padding: 0;
    margin-bottom: 8px;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--chrome-fg-dim);
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /*
   * The input is the control and it stays the control: it is what carries the
   * checked state, the label and the keyboard model. It is only moved out of
   * the way visually, and the ring comes back on the chip around it.
   */
  .choice input,
  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  /*
   * Every surface in here is mixed out of `--chrome-fg`, never a hard-coded
   * white at six per cent: this sheet is shown on the Minimal table too, where
   * the ink is dark and a white wash is invisible.
   */
  .choice {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--chrome-fg) 8%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--chrome-fg) 14%, transparent);
    cursor: pointer;
  }

  /* Lightness and a border, never hue alone — docs/notes.md. */
  .choice:has(input:checked) {
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .choice:has(input:focus-visible),
  .switch:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /*
   * The one line the deck list became: a name on the left, what it is on the
   * right, and the gallery a tap away. Sized like a .choice so the menu keeps
   * one rhythm down its whole length.
   */
  .row-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    background: color-mix(in srgb, var(--chrome-fg) 8%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--chrome-fg) 14%, transparent);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .row-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .row-value {
    color: var(--chrome-fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-value::after {
    content: " ›";
  }

  .switches {
    display: grid;
    gap: 8px;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    cursor: pointer;
  }

  /*
   * A switch that still says what it is with the colour taken away: the knob
   * travels as well as the track filling. Lightness and position, never hue
   * alone — the same rule as the legal-drop highlight, from docs/notes.md.
   */
  .track {
    position: relative;
    flex: 0 0 auto;
    width: 44px;
    height: 26px;
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

  .sheet-foot {
    display: flex;
    flex-wrap: wrap;
    /* Three links at fourteen pixels do not always fit a 360px phone in a row. */
    gap: 4px 20px;
    margin: 0;
    font-size: 14px;
  }

  .sheet-foot a,
  .sheet-foot .link {
    display: inline-block;
    /* Before `line-height`, which the shorthand would otherwise reset. */
    font: inherit;
    min-height: 44px;
    line-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--chrome-fg-dim);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
