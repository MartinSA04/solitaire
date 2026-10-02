<script lang="ts">
  interface Props {
    canUndo: boolean;
    /** Every card face up and the stock spent: the deal is already won. docs/02. */
    canFinish: boolean;
    onUndo: () => void;
    onHint: () => void;
    onFinish: () => void;
    onMenu: () => void;
  }

  const { canUndo, canFinish, onUndo, onHint, onFinish, onMenu }: Props =
    $props();
</script>

<!--
  The thumb zone, and the three controls docs/05-interaction-and-motion.md
  draws: Undo is the most-pressed button in the game, the middle slot is the
  assist, and ⋯ is everything else — a new deal, the daily, the stats, the
  settings.

  The middle slot is Hint until the board is provably won, and Finish from
  then on. They never both apply: once every card is face up and the stock is
  spent, the only hint worth giving is "press this".
-->
<div class="bar bottom-bar">
  <button
    class="control has-icon"
    type="button"
    disabled={!canUndo}
    onclick={onUndo}
  >
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 4.5 4 8l3.5 3.5" />
      <path d="M4.5 8H12a4 4 0 0 1 0 8H9" />
    </svg>
    Undo
  </button>
  {#if canFinish}
    <button class="control is-primary" type="button" onclick={onFinish}>
      Finish
    </button>
  {:else}
    <button class="control has-icon" type="button" onclick={onHint}>
      <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M7.5 13.5c0-1.6-2.5-2.9-2.5-6a5 5 0 0 1 10 0c0 3.1-2.5 4.4-2.5 6"
        />
        <path d="M7.75 16.5h4.5" />
      </svg>
      Hint
    </button>
  {/if}
  <button class="control" type="button" aria-label="Menu" onclick={onMenu}>
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle class="dot" cx="4.5" cy="10" r="1.4" />
      <circle class="dot" cx="10" cy="10" r="1.4" />
      <circle class="dot" cx="15.5" cy="10" r="1.4" />
    </svg>
  </button>
</div>

<style>
  /*
   * The one moment in the game where a control asks to be pressed. Everything
   * else in the bars is the same weight as everything else, because nothing
   * else in the bars is ever the obvious next thing to do.
   */
  .control.is-primary {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  /*
   * Drawn rather than typed: `↶` and `⋯` are whatever the system font makes of
   * them, and a `?` in front of Hint reads as a question rather than a button.
   * Stroked in the label's own colour, so a disabled Undo dims with its text.
   */
  .control.has-icon {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .icon {
    display: block;
    width: 20px;
    height: 20px;
    margin: auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .has-icon .icon {
    margin: 0;
  }

  .icon .dot {
    fill: currentColor;
    stroke: none;
  }
</style>
