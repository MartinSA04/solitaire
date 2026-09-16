<script lang="ts">
  import { formatClock } from "../clock.ts";

  interface Props {
    elapsedMs: number;
    moves: number;
    onNewDeal: () => void;
  }

  const { elapsedMs, moves, onNewDeal }: Props = $props();
</script>

<!--
  A placeholder, deliberately. Milestone 2 builds the real win sequence
  (docs/06-win-sequence.md) and this panel becomes its last stage; milestone 5
  fills it with records. Until then it exists so that winning is *acknowledged*,
  which is the part of "win detection" a player can actually see.
-->
<div class="result" role="dialog" aria-modal="true" aria-label="You won">
  <p class="result-title">You won</p>
  <p class="result-line">
    {formatClock(elapsedMs)} · {moves}
    {moves === 1 ? "move" : "moves"}
  </p>
  <button class="control result-action" type="button" onclick={onNewDeal}>
    New deal
  </button>
</div>

<style>
  .result {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    z-index: 5000;
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 24px 32px;
    border-radius: 16px;
    background: var(--sheet-bg);
    box-shadow: 0 18px 48px rgb(0 0 0 / 45%);
    text-align: center;
  }

  .result-title {
    margin: 0;
    font-size: 24px;
    font-weight: 650;
  }

  .result-line {
    margin: 0;
    color: var(--chrome-fg-dim);
    font-variant-numeric: tabular-nums;
  }

  .result-action {
    margin-top: 8px;
    background: var(--accent);
    color: var(--accent-contrast);
  }
</style>
