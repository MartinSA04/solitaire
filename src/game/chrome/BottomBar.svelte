<script lang="ts">
  interface Props {
    canUndo: boolean;
    onUndo: () => void;
    onNewDeal: () => void;
  }

  const { canUndo, onUndo, onNewDeal }: Props = $props();
</script>

<!-- The thumb zone. Undo is the most-pressed button in the game. -->
<div class="bar bottom-bar">
  <button class="control" type="button" disabled={!canUndo} onclick={onUndo}>
    ↶ Undo
  </button>
  <button class="control" type="button" onclick={onNewDeal}>New deal</button>
</div>
