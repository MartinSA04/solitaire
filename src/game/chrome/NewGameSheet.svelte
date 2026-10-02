<script module lang="ts">
  /**
   * Long enough to be a game worth keeping. The keyboard's `N` and `R` ask for
   * a second press past this many moves; the sheet does not ask at all,
   * because opening it and choosing a deal is already two deliberate taps.
   */
  export const CONFIRM_MOVES = 5;
</script>

<script lang="ts">
  import type { DrawCount } from "../../engine/index.ts";
  import Sheet from "./Sheet.svelte";

  interface Props {
    drawCount: DrawCount;
    winnableOnly: boolean;
    onDrawCount: (drawCount: DrawCount) => void;
    onWinnableOnly: (on: boolean) => void;
    onNewDeal: () => void;
    onReplay: () => void;
    onStats: () => void;
    onClose: () => void;
  }

  const {
    drawCount,
    winnableOnly,
    onDrawCount,
    onWinnableOnly,
    onNewDeal,
    onReplay,
    onStats,
    onClose,
  }: Props = $props();

  let sheet: ReturnType<typeof Sheet> | undefined = $state();

  /**
   * Which game comes next, and nothing about how it looks — that is Settings.
   * A button deals and the sheet gets out of the way. The draw mode and the
   * winnable pool describe the next deal, so changing them never touches the
   * one on the table.
   */
  function go(start: () => void): void {
    start();
    sheet?.dismiss();
  }

  const DRAWS = [1, 3] as const;
</script>

<Sheet title="New game" {onClose} bind:this={sheet}>
  <div class="tiles">
    <button class="tile is-primary" type="button" onclick={() => go(onNewDeal)}>
      New deal
    </button>
    <button class="tile" type="button" onclick={() => go(onReplay)}>
      Replay this deal
    </button>
  </div>

  <div class="options">
    <fieldset class="option">
      <legend class="option-label">Draw</legend>
      <div class="segmented">
        {#each DRAWS as count (count)}
          <label class="segment">
            <input
              type="radio"
              name="draw"
              value={count}
              checked={drawCount === count}
              onchange={() => onDrawCount(count)}
            />
            <span>{count} card{count === 1 ? "" : "s"}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <label class="switch">
      <input
        type="checkbox"
        checked={winnableOnly}
        onchange={(event) => onWinnableOnly(event.currentTarget.checked)}
      />
      <span class="track" aria-hidden="true"></span>
      <span>Winnable deals only</span>
    </label>
  </div>

  <p class="sheet-foot">
    <button
      class="link"
      type="button"
      onclick={() => {
        onStats();
        sheet?.dismiss();
      }}
    >
      Statistics
    </button>
  </p>
</Sheet>

<style>
  .tiles {
    display: grid;
    gap: 10px;
  }

  /* Mixed out of `--chrome-fg` so they read on the light table too. */
  .tile {
    width: 100%;
    min-height: 56px;
    padding: 0 16px;
    border: 0;
    border-radius: 14px;
    background: color-mix(in srgb, var(--chrome-fg) 8%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--chrome-fg) 14%, transparent);
    color: inherit;
    font: inherit;
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
  }

  .tile:hover:not(:disabled) {
    background: color-mix(in srgb, var(--chrome-fg) 13%, transparent);
  }

  .tile.is-primary {
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow: none;
  }

  .tile.is-primary:hover {
    background: color-mix(in srgb, var(--accent) 88%, var(--chrome-fg));
  }

  .tile:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .tile:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .options {
    display: grid;
    gap: 12px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid color-mix(in srgb, var(--chrome-fg) 12%, transparent);
  }

  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .option-label {
    float: left;
    padding: 0;
  }

  .segmented {
    display: inline-flex;
    padding: 3px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--chrome-fg) 8%, transparent);
  }

  .segment input,
  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .segment span {
    display: inline-flex;
    align-items: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 9px;
    cursor: pointer;
  }

  .segment:has(input:checked) span {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .segment:has(input:focus-visible) span,
  .switch:has(input:focus-visible) .track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .switch {
    display: flex;
    align-items: center;
    flex-direction: row-reverse;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    cursor: pointer;
  }

  /* The knob travels as well as the track filling: never hue alone. */
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
    margin: 8px 0 0;
    font-size: 14px;
  }

  .link {
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--chrome-fg-dim);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
