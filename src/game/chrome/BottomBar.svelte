<script lang="ts">
  interface Props {
    canUndo: boolean;
    onUndo: () => void;
    onNewDeal: () => void;
    onSettings: () => void;
  }

  const { canUndo, onUndo, onNewDeal, onSettings }: Props = $props();
</script>

<!--
  The thumb zone. Undo is the most-pressed button in the game.

  Three controls, which is the shape docs/05-interaction-and-motion.md draws:
  the third slot is Hint in that sketch and holds the overflow until milestone
  5 puts one there.
-->
<div class="bar bottom-bar">
  <button class="control" type="button" disabled={!canUndo} onclick={onUndo}>
    ↶ Undo
  </button>
  <button class="control" type="button" onclick={onNewDeal}>New deal</button>
  <button
    class="control"
    type="button"
    aria-label="Settings"
    onclick={onSettings}
  >
    ⋯
  </button>
</div>
