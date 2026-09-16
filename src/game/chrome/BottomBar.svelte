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
  <button class="control" type="button" disabled={!canUndo} onclick={onUndo}>
    ↶ Undo
  </button>
  {#if canFinish}
    <button class="control is-primary" type="button" onclick={onFinish}>
      Finish
    </button>
  {:else}
    <button class="control" type="button" onclick={onHint}>? Hint</button>
  {/if}
  <button class="control" type="button" aria-label="Menu" onclick={onMenu}>
    ⋯
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
</style>
